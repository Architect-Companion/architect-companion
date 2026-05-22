import Fastify from "fastify";

import { artifactRoutes } from "./artifacts/routes.js";
import { profileRoutes } from "./profiles/routes.js";
import { renderRoutes } from "./render/routes.js";

export function buildApp() {
  const app = Fastify({ logger: true });
  app.register(artifactRoutes, { prefix: "/api/artifacts" });
  app.register(profileRoutes, { prefix: "/api/profiles" });
  app.register(renderRoutes, { prefix: "/api/render" });
  return app;
}

export const PORT = Number(process.env["AC_PORT"] ?? 3000);
export const HOST = process.env["AC_HOST"] ?? "127.0.0.1";
