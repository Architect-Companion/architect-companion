export type HarnessConfig = {
  id: string;
  projectId: string;
  profileId: string;
  targets: Record<string, boolean>;
  createdAt: Date;
  updatedAt: Date;
};
