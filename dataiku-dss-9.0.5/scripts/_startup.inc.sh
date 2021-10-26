
# bkdl = "backend-like"
# Common functions for everything that should behave like the backend wrt
# classpath, env, ...

# ie, atm, this means: backend, dku, jek, fek

function bkdl_load_env_files(){
	# Load Hadoop specific environment if any
	if [ -f "$BINDIR"/env-hadoop.sh ]; then
  		source "$BINDIR"/env-hadoop.sh
	fi

	# Load Spark specific environment if any
	if [ -f "$BINDIR"/env-spark.sh ]; then
	  source "$BINDIR"/env-spark.sh
	fi

	# Load additional user-defined environment last if any
	if [ -f "$BINDIR"/env-site.sh ]; then
  		source "$BINDIR"/env-site.sh
	fi
}

function bkdl_get_cp() {
	# Load our log4j.properties first so that it does not get overriden by Hadoop,
	# and first the user's one
	_CP="$DIP_HOME/bin"
	_CP+=":$DKUINSTALLDIR/dist"
	# Load our code
	_CP+=":$DKUINSTALLDIR/dist/dataiku-core.jar"
	_CP+=":$DKUINSTALLDIR/dist/dataiku-scoring.jar"
	_CP+=":$DKUINSTALLDIR/dist/dataiku-dss-core.jar"
	_CP+=":$DKUINSTALLDIR/dist/dataiku-hproxy-client.jar"
	_CP+=":$DKUINSTALLDIR/dist/dataiku-app-platform.jar"
	_CP+=":$DKUINSTALLDIR/dist/dataiku-prepare-core.jar"
	_CP+=":$DKUINSTALLDIR/dist/dataiku-dip.jar"
	_CP+=":$DKUINSTALLDIR/dist/dataiku-server.jar"
	# Load our dependencies
	_CP+=":$DKUINSTALLDIR/lib/ivy/backend-run/*"
	_CP+=":$DKUINSTALLDIR/lib/ivy/common-run/*"
	_CP+=":$DKUINSTALLDIR/lib/shadelib/*"
	_CP+=":$DKUINSTALLDIR/lib/third/*"
	# Load JDBC drivers
	_CP+=":$DIP_HOME/lib/jdbc/*"
	# And other user-provided code
	_CP+=":$DIP_HOME/lib/java/*"

	_CP+=$(bkdl_get_plugins_cp)

	# Load Hadoop code last
	if [ "$DKU_HADOOP_ENABLED" = "true" ]; then
	  _CP+=":$DKU_HADOOP_CP:$DKU_HIVE_CP"
	fi
	echo "$_CP"
}

function bkdl_get_plugins_cp() {
  	PCP=""

	if [ -d "$DIP_HOME/plugins/installed" ]
	then
	  	for f in `ls $DIP_HOME/plugins/installed/`
	  	do
	  		echo "Loading plugin: $f" >&2
	  		if [ -f "$DIP_HOME/plugins/installed/$f/plugin.json" ]
	  		then
	  			PCP+=":$DIP_HOME/plugins/installed/$f/lib/*"
	  		fi
	  done
	fi
	if [ -d "$DIP_HOME/plugins/dev" ]
	then
		for f in `ls $DIP_HOME/plugins/dev/`
		do
		  	echo "Loading plugin: $f" >&2
		  	if [ -f "$DIP_HOME/plugins/dev/$f/plugin.json" ]
		  	then
		  		PCP+=":$DIP_HOME/plugins/dev/$f/lib/*"
		  	fi
		  done
	fi
	echo "$PCP"
}

function apinode_get_cp() {
	# Load our log4j.properties first so that it does not get overriden
	# and first the user's one
	_CP="$DIP_HOME/bin"
	_CP+=":$DKUINSTALLDIR/dist"
	# Load our code
	_CP+=":$DKUINSTALLDIR/dist/dataiku-core.jar"
	_CP+=":$DKUINSTALLDIR/dist/dataiku-scoring.jar"
	_CP+=":$DKUINSTALLDIR/dist/dataiku-dss-core.jar"
	_CP+=":$DKUINSTALLDIR/dist/dataiku-hproxy-client.jar"
	_CP+=":$DKUINSTALLDIR/dist/dataiku-app-platform.jar"
	_CP+=":$DKUINSTALLDIR/dist/dataiku-prepare-core.jar"
	_CP+=":$DKUINSTALLDIR/dist/dataiku-dip.jar"
	_CP+=":$DKUINSTALLDIR/dist/dataiku-lambda-server.jar"
	# Load our dependencies
	_CP+=":$DKUINSTALLDIR/lib/ivy/backend-run/*"
	_CP+=":$DKUINSTALLDIR/lib/ivy/common-run/*"
	_CP+=":$DKUINSTALLDIR/lib/shadelib/*"
	_CP+=":$DKUINSTALLDIR/lib/third/*"
	# Load JDBC drivers
	_CP+=":$DIP_HOME/lib/jdbc/*"
	# And other user-provided code
	_CP+=":$DIP_HOME/lib/java/*"

	echo "$_CP"
}

function hproxy_get_cp() {
  # Load our log4j.properties first so that it does not get overriden
  # and first the user's one
  _CP="$DIP_HOME/bin"
  _CP+=":$DKUINSTALLDIR/dist"
  # Load our code
  _CP+=":$DKUINSTALLDIR/dist/dataiku-core.jar"
  _CP+=":$DKUINSTALLDIR/dist/dataiku-dss-core.jar"
  _CP+=":$DKUINSTALLDIR/dist/dataiku-app-platform.jar"
  _CP+=":$DKUINSTALLDIR/dist/dataiku-prepare-core.jar"
  _CP+=":$DKUINSTALLDIR/dist/dataiku-dip.jar"
  _CP+=":$DKUINSTALLDIR/dist/dataiku-hproxy-client.jar"
  _CP+=":$DKUINSTALLDIR/dist/dataiku-hproxy-server.jar"
  # Load our dependencies
  _CP+=":$DKUINSTALLDIR/lib/ivy/common-run/*"
  _CP+=":$DKUINSTALLDIR/lib/shadelib/*"
  # Load Hadoop code last
  _CP+=":$DKU_HADOOP_CP"

  echo "$_CP"
}

function bkdl_set_java_env(){
	# Java environment to use
	if [ -z "$DKUJAVABIN" ]; then
	  echo >&2 "FATAL: DKUJAVABIN is not defined. Please check $BINDIR/env-default.sh"
	  exit 1
	fi
	# JaCoCo executions
	if [ -n "$DKU_JACOCO_PATH" ]; then
		DKU_BACKEND_JAVA_OPTS+=" -javaagent:$DKU_JACOCO_PATH=destfile=jacoco.backend.exec"
		DKU_JEK_JAVA_OPTS+=" -javaagent:$DKU_JACOCO_PATH=destfile=jacoco.backend.exec"
		DKU_HPROXY_JAVA_OPTS+=" -javaagent:$DKU_JACOCO_PATH=destfile=jacoco.hproxy.exec"
		DKU_JEK_JAVA_OPTS+=" -javaagent:$DKU_JACOCO_PATH=destfile=jacoco.jek.exec"
		DKU_DKU_JAVA_OPTS+=" -javaagent:$DKU_JACOCO_PATH=destfile=jacoco.dku.exec"
	fi
}

function bkdl_set_py_env(){
	# Python environment to use
	if [ -z "$DKUPYTHONBIN" ]; then
		export DKUPYTHONBIN="$DIP_HOME"/bin/python
	fi
	# On MacOS, set default matplotlib backend to Agg to avoid framework-related load failures
	if [ "$(uname)" = "Darwin" ]; then
    	export MPLBACKEND="Agg"
  	fi
}

function bkdl_set_R_env(){
	if [ -z "$DKURBIN" ] && _DKURBIN=$(command -v R); then
		export DKURBIN="$_DKURBIN"
	fi
	if [ -n "$DKURBIN" ]; then
		export DKURLIB="$DIP_HOME"/R.lib
	fi
}

function bkdl_set_julia_env(){
	if [ -z "$DKUJULIABIN" ] && _DKUJULIABIN=$(command -v julia); then
		export DKUJULIABIN="$_DKUJULIABIN"
	fi
	if [ -z "$DKUJULIADEPOT" ]; then
		export DKUJULIADEPOT="$DIP_HOME"/code-envs/julia
	fi
}

function bkdl_set_R_libs(){
	if [ -n "$DKURBIN" -a -z "$DKU_RLIBS_SET" ]; then
		if [ -z "$R_LIBS" ]; then
			export R_LIBS="$DKURLIB:$DKUINSTALLDIR/R"
		else
			export R_LIBS="$DKURLIB:$DKUINSTALLDIR/R:$R_LIBS"
		fi
		export DKU_RLIBS_SET=1
	fi
}

function bkdl_set_global_env(){
	# Force default locale
	export LC_ALL=en_US.UTF-8
	# Default to write-protect all created files
	umask 22
	# Raise default ulimits to more reasonable values
	case "$(uname)" in
		Linux)
			ulimit -Sn hard
			ulimit -Su hard
			;;
		Darwin)
			if [ "$(ulimit -Sn)" != "unlimited" -a "$(ulimit -Sn)" -lt 1024 ]; then
				# Attempt to push limit, ignore errors
				ulimit -Sn 1024 2>/dev/null || true
			fi
			;;
	esac
}

function bkdl_env_sanity_check() {
	# Globally disable http proxy for localhost, as we use it for interprocess communication
	if [ -z "$DKU_NOPROXY_SET" -a \( -n "$http_proxy" -o -n "$HTTP_PROXY" \) ]; then
		if [ -n "$no_proxy" ]; then
			export no_proxy="127.0.0.1,localhost,$no_proxy"
		elif [ -n "$NO_PROXY" ]; then
			export NO_PROXY="127.0.0.1,localhost,$NO_PROXY"
		else
			export no_proxy="127.0.0.1,localhost"
		fi
		export DKU_NOPROXY_SET=1
	fi
}
