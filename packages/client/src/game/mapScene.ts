/**
 * Сцена карты приключений. Только показывает состояние и передаёт касания
 * в партию; правил игры здесь нет (догма 5).
 */
import { cellsAlong } from "@homamru/core";
import type { GameEvent, GameState, GuardState } from "@homamru/core";
import * as Phaser from "phaser";
import { installCameraControl } from "./cameraControl.ts";
import { creatureName } from "./captions.ts";
import type { FrameMeter } from "./frameMeter.ts";
import { cellAt, cellCenter, TILE } from "./geometry.ts";
import { createObjectStub, objectStubKey, ZONE_ALPHA, ZONE_COLOR } from "./objectStubs.ts";
import { activeHero } from "./session.ts";
import type { Selection, Session } from "./session.ts";
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
const OBJECT_DEPTH = 1;
const PATH_DEPTH = 2;
const HERO_DEPTH = 3;
/** Пауза между приходом героя в зону охранника и экраном боя: игрок видит, где герой встал. */
const BATTLE_PAUSE_MS = 350;

interface ObjectStub {
  readonly key: string;
  readonly node: Phaser.GameObjects.Container;
}

export class MapScene extends Phaser.Scene {
  private readonly session: Session;
  private readonly frameMeter: FrameMeter;
  private readonly heroes = new Map<string, Phaser.GameObjects.Container>();
  private readonly objects = new Map<string, ObjectStub>();
  private pathGraphics: Phaser.GameObjects.Graphics | undefined;
  /** Герой идёт по клеткам: пока идёт, касания карты не принимаются. */
  private walking = false;

  constructor(session: Session, frameMeter: FrameMeter) {
    super("map");
    this.session = session;
    this.frameMeter = frameMeter;
  }

  override update(_time: number, delta: number): void {
    this.frameMeter.add(delta);
  }

  create(): void {
    const { state } = this.session.getSnapshot();
    this.createTerrain(state);
    this.pathGraphics = this.add.graphics().setDepth(PATH_DEPTH);
    for (const hero of state.heroes) {
      const stub = createHeroStub(this, hero.id, hero.owner).setDepth(HERO_DEPTH);
      this.heroes.set(hero.id, stub);
    }
    this.settle();

    installCameraControl(this, {
      worldWidth: state.map.width * TILE,
      worldHeight: state.map.height * TILE,
      onTap: (worldX, worldY) => {
        this.onTap(worldX, worldY);
      },
      onHold: (worldX, worldY) => {
        const cell = cellAt(worldX, worldY, state.map.width, state.map.height);
        if (cell !== null && !this.walking) {
          this.session.inspectCell(cell);
        }
      },
    });
    const hero = activeHero(state);
    if (hero !== undefined) {
      const center = cellCenter(hero);
      this.cameras.main.centerOn(center.x, center.y);
    }

    const unsubscribe = this.session.subscribe((_snapshot, events) => {
      this.onChange(events);
    });
    // Phaser, который уничтожают целиком, о закрытии сцены не сообщает — только об уничтожении.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    this.events.once(Phaser.Scenes.Events.DESTROY, unsubscribe);
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

  private onChange(events: readonly GameEvent[]): void {
    const steps = events.filter((event) => event.type === "heroStepped");
    const stub = this.heroes.get(steps[0]?.heroId ?? "");
    if (stub === undefined) {
      if (!this.walking) {
        this.settle();
      }
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
        this.settle();
      },
    });
  }

  /** Показывает состояние как есть: герой дошёл или ничего не двигалось. */
  private settle(): void {
    const { state, selection, battle } = this.session.getSnapshot();
    this.placeHeroes(state);
    this.syncObjects(state);
    this.drawSelection(selection, state);
    if (state.battle !== null && battle === null) {
      this.time.delayedCall(BATTLE_PAUSE_MS, () => {
        this.session.enterBattle();
      });
    }
  }

  /** Приводит заглушки объектов к состоянию: подобранное и побеждённое исчезает, флажки меняются. */
  private syncObjects(state: GameState): void {
    const present = new Set(state.objects.map((object) => object.id));
    for (const [id, stub] of this.objects) {
      if (!present.has(id)) {
        stub.node.destroy();
        this.objects.delete(id);
      }
    }
    for (const object of state.objects) {
      const key = objectStubKey(object);
      const existing = this.objects.get(object.id);
      if (existing?.key === key) {
        continue;
      }
      existing?.node.destroy();
      const name = object.type === "guard" ? creatureName(state, object.creature) : "";
      const center = cellCenter(object);
      const node = createObjectStub(this, object, name)
        .setPosition(center.x, center.y)
        .setDepth(OBJECT_DEPTH);
      this.objects.set(object.id, { key, node });
    }
  }

  /** Клетки зоны охранника и кольцо на нём самом: здесь будет бой. */
  private drawZone(
    graphics: Phaser.GameObjects.Graphics,
    guard: GuardState,
    state: GameState,
  ): void {
    graphics.fillStyle(ZONE_COLOR, ZONE_ALPHA);
    for (let y = guard.y - 1; y <= guard.y + 1; y += 1) {
      for (let x = guard.x - 1; x <= guard.x + 1; x += 1) {
        const inside = x >= 0 && y >= 0 && x < state.map.width && y < state.map.height;
        if (inside && (x !== guard.x || y !== guard.y)) {
          graphics.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
    }
    const center = cellCenter(guard);
    graphics.lineStyle(6, ZONE_COLOR, 1);
    graphics.strokeCircle(center.x, center.y, TILE * 0.47);
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
    if (selection.guard !== null) {
      this.drawZone(graphics, selection.guard, state);
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
