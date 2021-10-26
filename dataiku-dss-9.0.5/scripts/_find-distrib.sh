#!/bin/bash -e
# Identifies the underlying OS distribution

# Upon success, prints: DISTRIB MAJOR[.MINOR]
# where DISTRIB is one of: debian ubuntu centos redhat amazonlinux osx
# and MAJOR / MINOR are distrib-specific numeric identifiers

distrib=
distribVersion=

if [ "$(uname)" = "Darwin" ]; then
	distrib=osx
	distribVersion="$(sw_vers -productVersion | cut -d . -f 1-2)"

elif [ -f /etc/os-release ] &&
	ID="$(bash -c 'ID=; source /etc/os-release && echo "$ID"' 2>/dev/null)" &&
	VERSION_ID="$(bash -c 'VERSION_ID=; source /etc/os-release && echo "$VERSION_ID"' 2>/dev/null)"; then
	case "$ID" in
		debian | ubuntu | centos)
			distrib="$ID"
			distribVersion="$VERSION_ID"
			;;
		rhel)
			distrib=redhat
			distribVersion="$VERSION_ID"
			;;
		amzn)
			distrib=amazonlinux
			distribVersion="$VERSION_ID"
			;;
		ol)
			distrib=oraclelinux
			distribVersion="$VERSION_ID"
			;;
		sles)
			distrib=suse
			distribVersion="$VERSION_ID"
			;;
	esac

elif command -v lsb_release >/dev/null; then
	case "$(lsb_release -si)" in
		Debian )
			distrib=debian
			distribVersion="$(lsb_release -sr | cut -d . -f 1-2)"
			;;
		Ubuntu )
			distrib=ubuntu
			distribVersion="$(lsb_release -sr | cut -d . -f 1-2)"
			;;
		CentOS )
			distrib=centos
			distribVersion="$(lsb_release -sr | cut -d . -f 1-2)"
			;;
		RedHatEnterpriseServer )
			distrib=redhat
			distribVersion="$(lsb_release -sr | cut -d . -f 1-2)"
			;;
		AmazonAMI | Amazon )
			distrib=amazonlinux
			distribVersion="$(lsb_release -sr | cut -d . -f 1-2)"
			;;
		OracleServer )
			distrib=oraclelinux
			distribVersion="$(lsb_release -sr | cut -d . -f 1-2)"
			;;
		"SUSE LINUX" )
			distrib=suse
			distribVersion="$(lsb_release -sr | cut -d . -f 1-2)" # Nb: does not include patchlevel on SLES 11
			;;
	esac

else
	# No /etc/os-release nor lsb_release: fallback to distribution-specific version files
	if [ -f /etc/debian_version ]; then
		case "$(cat /etc/debian_version)" in
			7.* )
				distrib=debian
				distribVersion="$(cat /etc/debian_version | cut -d . -f 1-2)"
				;;
		esac
	elif [ -f /etc/system-release ]; then
		case "$(cat /etc/system-release)" in
			"CentOS release "* | "CentOS Linux release "* )
				distrib=centos
				distribVersion="$(sed -n 's/.*release \([^ ]*\).*/\1/p' /etc/system-release | cut -d . -f 1-2)"
				;;
			"Red Hat Enterprise Linux Server release "* )
				distrib=redhat
				distribVersion="$(sed -n 's/.*release \([^ ]*\).*/\1/p' /etc/system-release | cut -d . -f 1-2)"
				;;
			"Amazon Linux AMI release "* | "Amazon Linux release "* )
				distrib=amazonlinux
				distribVersion="$(sed -n 's/.*release \([^ ]*\).*/\1/p' /etc/system-release | cut -d . -f 1-2)"
				;;
			"Oracle Linux Server release "* )
				distrib=oraclelinux
				distribVersion="$(sed -n 's/.*release \([^ ]*\).*/\1/p' /etc/system-release | cut -d . -f 1-2)"
				;;
		esac
	elif [ -f /etc/SuSE-release ]; then
		case "$(cat /etc/SuSE-release)" in
			"SUSE Linux Enterprise Server "* )
				version="$(sed -n 's/^VERSION = \(.*\)/\1/p' /etc/SuSE-release)"
				patchlevel="$(sed -n 's/^PATCHLEVEL = \(.*\)/\1/p' /etc/SuSE-release)"
				if [ -n "$version" -a -n "patchlevel" ]; then
					distrib=suse
					if [ "$patchlevel" = "0" ]; then
						distribVersion="$version"
					else
						distribVersion="$version"."$patchlevel"
					fi
				fi
				;;
		esac
	fi
fi

if [ -z "$distrib" ]; then
	echo "*** Could not identify OS distribution" >&2
	exit 1
fi

echo "$distrib $distribVersion"
