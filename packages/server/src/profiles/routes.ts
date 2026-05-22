import type { FastifyInstance } from "fastify";

import { HarnessConfigError } from "@architect-companion/core";

import { findAllProfiles, findProfile, saveProfile } from "./service.js";

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    ["text/yaml", "text/x-yaml", "application/x-yaml", "text/plain"],
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.post("/", async (request, reply) => {
    const yaml = request.body as string;

    if (!yaml || typeof yaml !== "string") {
      return reply.code(400).send({ error: "Request body must be a YAML string." });
    }

    try {
      const metadata = await saveProfile(yaml);
      return reply.code(201).send(metadata);
    } catch (error) {
      if (error instanceof HarnessConfigError) {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get("/", async (_request, reply) => {
    const profiles = await findAllProfiles();
    return reply.send(profiles);
  });

  app.get<{ Params: { name: string; version: string } }>(
    "/:name/:version",
    async (request, reply) => {
      const { name, version } = request.params;
      const yaml = await findProfile(name, version);

      if (!yaml) {
        return reply.code(404).send({ error: `Profile "${name}@${version}" not found.` });
      }

      return reply.type("text/yaml").send(yaml);
    },
  );
}
