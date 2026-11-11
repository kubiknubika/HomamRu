/**
 * Управление камерой: перетаскивание двигает карту, щипок и колесо мыши
 * меняют масштаб, короткое касание без сдвига считается выбором клетки.
 */
import * as Phaser from "phaser";
import { CAMERA_MARGIN_PX, cameraBounds, clampZoom, NORMAL_ZOOM } from "./geometry.ts";

/** Сдвиг пальца в пикселях экрана, после которого касание уже не выбор клетки. */
const TAP_SLOP = 10;
const WHEEL_ZOOM_SPEED = 0.0015;

export interface CameraControlOptions {
  readonly worldWidth: number;
  readonly worldHeight: number;
  /** Вызывается при коротком касании; координаты — в мире. */
  readonly onTap: (worldX: number, worldY: number) => void;
}

export function installCameraControl(scene: Phaser.Scene, options: CameraControlOptions): void {
  const camera = scene.cameras.main;
  const input = scene.input;
  // По умолчанию у Phaser мышь и одно касание; для щипка нужно второе.
  input.addPointer(1);

  let pinchDistance = 0;
  /** Жест уже двигал или масштабировал карту — отпускание не считается касанием. */
  let gestureMoved = false;

  function applyBounds(): void {
    const margin = CAMERA_MARGIN_PX / camera.zoom;
    const horizontal = cameraBounds(options.worldWidth, camera.displayWidth, margin);
    const vertical = cameraBounds(options.worldHeight, camera.displayHeight, margin);
    camera.setBounds(horizontal.start, vertical.start, horizontal.size, vertical.size);
    camera.setScroll(camera.clampX(camera.scrollX), camera.clampY(camera.scrollY));
  }

  function setZoom(zoom: number): void {
    camera.setZoom(clampZoom(zoom));
    applyBounds();
  }

  function touches(): Phaser.Input.Pointer[] {
    return [input.pointer1, input.pointer2].filter((pointer) => pointer.isDown);
  }

  function onMove(pointer: Phaser.Input.Pointer): void {
    if (!pointer.isDown) {
      return;
    }
    const [first, second] = touches();
    if (first !== undefined && second !== undefined) {
      const distance = Phaser.Math.Distance.Between(first.x, first.y, second.x, second.y);
      if (pinchDistance > 0 && distance > 0) {
        setZoom(camera.zoom * (distance / pinchDistance));
      }
      pinchDistance = distance;
      gestureMoved = true;
      return;
    }
    pinchDistance = 0;
    if (pointer.getDistance() < TAP_SLOP && !gestureMoved) {
      return;
    }
    gestureMoved = true;
    const dx = (pointer.x - pointer.prevPosition.x) / camera.zoom;
    const dy = (pointer.y - pointer.prevPosition.y) / camera.zoom;
    camera.setScroll(camera.clampX(camera.scrollX - dx), camera.clampY(camera.scrollY - dy));
  }

  function onUp(pointer: Phaser.Input.Pointer): void {
    pinchDistance = 0;
    const stillTouching = touches().length > 0;
    if (!gestureMoved && !stillTouching && pointer.getDistance() < TAP_SLOP) {
      const point = camera.getWorldPoint(pointer.x, pointer.y);
      options.onTap(point.x, point.y);
    }
    if (!stillTouching) {
      gestureMoved = false;
    }
  }

  function onWheel(_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    setZoom(camera.zoom * Math.exp(-dy * WHEEL_ZOOM_SPEED));
  }

  input.on(Phaser.Input.Events.POINTER_MOVE, onMove);
  input.on(Phaser.Input.Events.POINTER_UP, onUp);
  input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);
  input.on(Phaser.Input.Events.POINTER_WHEEL, onWheel);
  scene.scale.on(Phaser.Scale.Events.RESIZE, applyBounds);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, applyBounds);
  });

  setZoom(NORMAL_ZOOM);
}
