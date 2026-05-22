import type { FastifyInstance } from "fastify";

import { listProjects, readProjectFiles } from "./service.js";

export async function artifactRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (_request, reply) => {
    const projects = await listProjects();
    return reply.send(projects);
  });

  app.get<{ Params: { projectName: string } }>("/:projectName", async (request, reply) => {
    const { projectName } = request.params;
    const files = await readProjectFiles(projectName);

    if (files === undefined) {
      return reply.code(404).send({ error: `Project "${projectName}" not found.` });
    }

    return reply.send({ files, projectName });
  });
}
