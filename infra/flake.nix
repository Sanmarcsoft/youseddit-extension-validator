{
  description = "YouSeddit Extension Validator infrastructure";

  inputs = {
    infra-lib.url = "github:Sanmarcsoft/pulumi-scaleway-lib";
  };

  outputs = { self, infra-lib, ... }: {
    devShells = infra-lib.devShells;
  };
}
