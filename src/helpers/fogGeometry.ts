import { Ring, Polygon, Geom } from "polygon-clipping";
import { Fog } from "../types/Fog";

export function fogToGeometry(fog: Fog): Geom {
  const shapePoints: Ring = fog.data.points.map(({ x, y }) => [x, y]);
  const shapeHoles: Polygon = fog.data.holes.map((hole) =>
    hole.map(({ x, y }) => [x, y])
  );
  return [[shapePoints, ...shapeHoles]];
}
