{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs
    pnpm_10
  ];

  shellHook = ''
    echo "nvim-pi development environment"
    echo "Run 'pnpm install' to install JS deps"
  '';
}
