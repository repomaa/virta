{
  description = "A new Pebble app";

  inputs = {
    nixpkgs.follows = "pebble/nixpkgs";
    pebble.url = "github:pebble-dev/pebble.nix";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      pebble,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ pebble.overlays.default ];
        };
        moddable-tools = pkgs.callPackage ./moddable-tools.nix { };
      in
      {
        devShell = pebble.pebbleEnv.${system} {
          packages = [
            moddable-tools
            pkgs.typescript
          ];
          MODDABLE = "${moddable-tools}";
          shellHook = ''
                        export PATH="$PWD/node_modules/.bin:$PATH"

                        PEBBLE_SDK_DIR="$HOME/.pebble-sdk/SDKs"
                        if [ -d "$PEBBLE_SDK_DIR" ]; then
                          for sdk in "$PEBBLE_SDK_DIR"/*; do
                            if [ -d "$sdk/toolchain/moddable" ]; then
                              mkdir -p "$sdk/toolchain/moddable-tools"
                              # Remove old unpatched Moddable SDK binaries that the Pebble SDK
                              # may have placed here, so our Nix-built versions are used instead.
                              find "$sdk/toolchain/moddable-tools" -maxdepth 1 -type f -executable ! -name 'mcrun' -delete 2>/dev/null || true
                              cat > "$sdk/toolchain/moddable-tools/mcrun" <<'EOF'
            #!/bin/sh
            export MODDABLE=${moddable-tools}
            exec ${moddable-tools}/bin/mcrun "$@"
            EOF
                              chmod +x "$sdk/toolchain/moddable-tools/mcrun"
                            fi
                          done
                        fi
          '';
        };
      }
    );
}
