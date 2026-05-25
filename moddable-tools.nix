{ lib, stdenv, fetchFromGitHub, pkg-config, glib, gnumake, dash, which }:

stdenv.mkDerivation rec {
  pname = "moddable-tools";
  version = "unstable-2025-01-12";

  src = fetchFromGitHub {
    owner = "Moddable-OpenSource";
    repo = "moddable";
    rev = "fdd139210b9828e4a76ea6e477bbcbe6b635d8a5";
    sha256 = "00h3h41qccxnzbs0qk7nv7ys3fzy5n5albiw651ws8jibj0agbhy";
  };

  nativeBuildInputs = [ gnumake pkg-config which ];
  buildInputs = [ glib ];

  postPatch = ''
    substituteInPlace build/makefiles/lin/tools.mk \
      --replace '/bin/dash' '${dash}/bin/dash'
    substituteInPlace tools/mcrun/make.pebble.mk \
      --replace 'open -a $(SIMULATOR) $(ARCHIVE)' 'true'
    substituteInPlace tools/mcrun/make.pebble-ffi.mk \
      --replace 'open -a $(SIMULATOR) $(ARCHIVE)' 'true'
    substituteInPlace typings/pebble/global.d.ts \
      --replace "typeof import('web/websocket').default" "any"
  '';

  buildPhase = ''
    export MODDABLE=$(pwd)
    export XS_DIR=$(pwd)/xs
    export BUILD_DIR=$(pwd)/build

    make GOAL=release -f xs/makefiles/lin/xsc.mk
    make GOAL=release -f xs/makefiles/lin/xsid.mk
    make GOAL=release -f xs/makefiles/lin/xsl.mk
    make GOAL=release -f build/makefiles/lin/tools.mk
  '';

  installPhase = ''
    mkdir -p $out
    cp -r . $out/

    mkdir -p $out/bin
    for bin in $out/build/bin/lin/release/*; do
      if [ -f "$bin" ]; then
        name=$(basename "$bin")
        if [ -x "$bin" ] && [ ! -d "$bin" ]; then
          ln -s "$bin" "$out/bin/$name"
        fi
      fi
    done
  '';

  meta = with lib; {
    description = "Moddable SDK command-line tools (mcrun, mcconfig, etc.)";
    homepage = "https://github.com/Moddable-OpenSource/moddable";
    license = licenses.gpl3Plus;
    platforms = platforms.linux;
  };
}
