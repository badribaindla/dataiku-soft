#! /bin/bash

if [[ -z "$DIP_HOME" ]]; then
    echo "[ERROR] DIP_HOME environment variable should be provided."
    exit 1
fi

while [[ "$1" == -* ]]; do
	if [ $# -ge 2 -a "$1" = "-juliaBin" ]; then
		DKUJULIABIN="$2"
		shift 2
	elif [ $# -ge 2 -a "$1" = "-juliaDepot" ]; then
		DKUJULIADEPOT="$2"
		shift 2
	fi
done


if [ -z "$DKUJULIADEPOT" ]; then
    export DKUJULIADEPOT="$DIP_HOME"/code-envs/julia
fi

mkdir -p $DKUJULIADEPOT

DKUJULIADEPOT=$(cd "$DKUJULIADEPOT" && pwd -P)
KERNEL_PATH="$DIP_HOME"/jupyter-run/jupyter/

# Julia interpreter to use
if [ -z "$DKUJULIABIN" ]; then
	DKUJULIABIN=$(command -v julia)
fi

CURRENT_JULIA_VERSION=`$DKUJULIABIN -version`
echo "Installing Julia integration for" $CURRENT_JULIA_VERSION

echo "[+] Creating wrapper script $DIP_HOME/bin/julia"
cat >"$DIP_HOME"/bin/julia <<EOF
JULIA_DEPOT_PATH=$DKUJULIADEPOT $DKUJULIABIN "\$@"
EOF
chmod 755 "$DIP_HOME"/bin/julia

JULIA_DEPOT_PATH=$DKUJULIADEPOT JUPYTER_DATA_DIR=$KERNEL_PATH "$DIP_HOME"/bin/julia --color=yes <<'EOF'
using Pkg

pkg"add https://github.com/dataiku/Dataiku.jl"
pkg"up Dataiku"
pkg"add JSON, DataFrames"

kernelspec = ["Julia"]

@static if VERSION >= v"1.3.1"
	pkg"add PackageCompiler"
	using PackageCompiler, Dataiku

	# we create a system image that contains an Ahead Of Time compilation of the package and
	# all its dependencies, when starting julia with this system image, there will be much
	# less compilation at runtime (around 10x smaller overhead).
	precompile_path = joinpath(dirname(dirname(pathof(Dataiku))), "precompile.jl")
	sysimg = joinpath(ENV["JULIA_DEPOT_PATH"], "dku-sysimg.so")

	create_sysimage(:Dataiku; sysimage_path=sysimg, precompile_statements_file=precompile_path)
	@info "System image created : " * sysimg

	append!(kernelspec, ["-J", sysimg])
else
	@info "Package precompilation requires julia version >= 1.3.1"
	@info "Julia integration is usable but precompilation will be done at runtime, resulting in significant overhead (yet less than a minute) when running julia recipes and notebooks."
end

pkg"add IJulia"
using IJulia

installkernel(kernelspec...; env=Dict("JULIA_DEPOT_PATH" => ENV["JULIA_DEPOT_PATH"]))
EOF

echo "[+] Done"

chmod -R u=rwX,g=rX,o=rX "$DKUJULIADEPOT"
