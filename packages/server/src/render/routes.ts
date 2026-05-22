import type { FastifyInstance } from "fastify";

import { HarnessConfigError } from "@architect-companion/core";

import { renderForProject } from "./service.js";
import type { RenderRequest } from "./types.js";

export async function renderRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RenderRequest }>("/", async (request, reply) => {
    const body = request.body;

    if (
      typeof body?.modulesYaml !== "string" ||
      typeof body.profileName !== "string" ||
      typeof body.profileVersion !== "string" ||
      typeof body.projectName !== "string"
    ) {
      return reply
        .code(400)
        .send({ error: "Missing required fields: modulesYaml, profileName, profileVersion, projectName." });
    }

    try {
      const response = await renderForProject(body);
      return reply.send(response);
    } catch (error) {
      if (error instanceof HarnessConfigError) {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
  });
}
