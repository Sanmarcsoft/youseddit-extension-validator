import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";

const stack = pulumi.getStack();

// Object Storage for extension validation artifacts
const artifactsBucket = new scaleway.ObjectBucket("youseddit-validator-artifacts", {
  name: `youseddit-validator-artifacts-${stack}`,
  region: "fr-par",
  versioning: {
    enabled: true,
  },
  tags: {
    project: "youseddit-extension-validator",
    environment: stack,
    managed_by: "pulumi",
  },
});

export const bucketEndpoint = artifactsBucket.endpoint;
export const bucketName = artifactsBucket.name;
