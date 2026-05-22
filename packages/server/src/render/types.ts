export type RenderRequest = {
  modulesYaml: string;
  profileName: string;
  profileVersion: string;
  projectName: string;
  stack?: string;
  targets?: Record<string, boolean>;
};

export type RenderResponse = {
  files: Record<string, string>;
  projectName: string;
};
