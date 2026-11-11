/**
 * Сцена карты приключений. Только показывает состояние и передаёт касания
 * в партию; правил игры здесь нет (догма 5).
 */
import { cellsAlong } from "@homamru/core";
import type { GameEvent, GameState } from "@homamru/core";
import * as Phaser from "phaser";
import { installCameraControl } from "./cameraControl.ts";
import { cellAt, cellCenter, TILE } from "./geometry.ts";
import { activeHero } from "./session.ts";
import type { Selection, Session, SessionSnapshot } from "./session.ts";
import {
  createHeroStub,
  createTerrainTexture,
  LAND_TILE,
  OBSTACLE_TILE,
  PATH_LATER_COLOR,
  PATH_TODAY_COLOR,
  TERRAIN_TEXTURE,
  UNREACHABLE_COLOR,
} from "./stubs.ts";

const STEP_DURATION_MS = 90;
const PATH_DOT_RADIUS = TILE * 0.13;
const TARGET_RADIUS = TILE * 0.3;
const PATH_DEPTH = 1;
const HERO_DEPTH = 2;

export class MapScene extends Phaser.Scene {
  private readonly session: Session;
  private readonly heroes = new Map<string, Phaser.GameObjects.Container>();
  private pathGraphics: Phaser.GameObjects.Graphics | undefined;
  /** Герой идёт по клеткам: пока идёт, касания карты не принимаются. */
  private walking = false;

  constructor(session: Session) {
    super("map");
    this.session = session;
  }

  create(): void {
    const { state, selection } = this.session.getSnapshot();
    this.createTerrain(state);
    this.pathGraphics = this.add.graphics().setDepth(PATH_DEPTH);
    for (const hero of state.heroes) {
      const stub = createHeroStub(this, hero.id, hero.owner).setDepth(HERO_DEPTH);
      this.heroes.set(hero.id, stub);
    }
    this.placeHeroes(state);
    this.drawSelection(selection, state);

    installCameraControl(this, {
      worldWidth: state.map.width * TILE,
      worldHeight: state.map.height * TILE,
      onTap: (worldX, worldY) => {
        this.onTap(worldX, worldY);
      },
    });
    const hero = activeHero(state);
    if (hero !== undefined) {
      const center = cellCenter(hero);
      this.cameras.main.centerOn(center.x, center.y);
    }

    const unsubscribe = this.session.subscribe((snapshot, events) => {
      this.onChange(snapshot, events);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }

  private createTerrain(state: GameState): void {
    createTerrainTexture(this);
    const data = state.map.terrain.map((row) =>
      [...row].map((symbol) => (symbol === "." ? LAND_TILE : OBSTACLE_TILE)),
    );
    const tilemap = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = tilemap.addTilesetImage("terrain", TERRAIN_TEXTURE, TILE, TILE, 0, 0);
    if (tileset === null) {
      throw new Error("Не удалось создать набор плиток местности.");
    }
    tilemap.createLayer(0, tileset, 0, 0);
  }

  private onTap(worldX: number, worldY: number): void {
    if (this.walking) {
      return;
    }
    const { map } = this.session.getSnapshot().state;
    const cell = cellAt(worldX, worldY, map.width, map.height);
    if (cell !== null) {
      this.session.tapCell(cell);
    }
  }

  private onChange(snapshot: SessionSnapshot, events: readonly GameEvent[]): void {
    const steps = events.filter((event) => event.type === "heroStepped");
    const stub = this.heroes.get(steps[0]?.heroId ?? "");
    if (stub === undefined) {
      this.placeHeroes(snapshot.state);
      this.drawSelection(snapshot.selection, snapshot.state);
      return;
    }
    // Герой идёт по клеткам; путь перерисовывается, когда он дошёл.
    this.walking = true;
    this.pathGraphics?.clear();
    this.tweens.chain({
      targets: stub,
      tweens: steps.map((step) => ({ ...cellCenter(step.to), duration: STEP_DURATION_MS })),
      onComplete: () => {
        this.walking = false;
        const latest = this.session.getSnapshot();
        this.placeHeroes(latest.state);
        this.drawSelection(latest.selection, latest.state);
      },
    });
  }

  private placeHeroes(state: GameState): void {
    for (const hero of state.heroes) {
      const center = cellCenter(hero);
      this.heroes.get(hero.id)?.setPosition(center.x, center.y);
    }
  }

  private drawSelection(selection: Selection | null, state: GameState): void {
    const graphics = this.pathGraphics;
    const hero = activeHero(state);
    if (graphics === undefined) {
      return;
    }
    graphics.clear();
    if (selection === null || hero === undefined) {
      return;
    }
    const target = cellCenter(selection.target);
    if (!selection.path.found) {
      // Недостижимая клетка: красный крест.
      const arm = TARGET_RADIUS * 0.8;
      graphics.lineStyle(8, UNREACHABLE_COLOR, 1);
      graphics.lineBetween(target.x - arm, target.y - arm, target.x + arm, target.y + arm);
      graphics.lineBetween(target.x - arm, target.y + arm, target.x + arm, target.y - arm);
      return;
    }
    const { steps, stepsToday } = selection.path;
    for (const [index, cell] of cellsAlong(hero, steps).entries()) {
      const center = cellCenter(cell);
      const color = index < stepsToday ? PATH_TODAY_COLOR : PATH_LATER_COLOR;
      if (index === steps.length - 1) {
        graphics.lineStyle(6, color, 1);
        graphics.strokeCircle(center.x, center.y, TARGET_RADIUS);
      }
      graphics.fillStyle(color, 1);
      graphics.fillCircle(center.x, center.y, PATH_DOT_RADIUS);
    }
  }
}
