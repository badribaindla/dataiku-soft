import os, os.path as osp, stat
import pwd, grp, subprocess
import logging
import sys

if sys.version_info[0] == 2:
	from ConfigParser import RawConfigParser
else:
	from configparser import RawConfigParser


def safe_read_config(security_conf_dir):
	logging.info("Reading security conf from %s" % security_conf_dir)
	fp = osp.join(security_conf_dir, "security-config.ini")

	# Do follow symlinks
	conf_stat = os.stat(fp)
	# Check it belongs to root
	if conf_stat.st_uid != 0:
		raise Exception("Security config file %s must be owned by root", fp)
	# Check it has --- permissions for other
	if stat.S_IMODE(conf_stat.st_mode) & stat.S_IRWXO != 0:
		raise Exception("Security config file %s must not be world-readable", fp)

	with open(fp) as f:
		conf = RawConfigParser()
		conf.readfp(f)

	return conf

def _get_option(conf, section, option, default=None):
    return (conf.get(section, option)
            if conf.has_section(section) and conf.has_option(section, option)
            else default)

def check_within_dip_home(security_conf_dir, target_dir):
	conf = safe_read_config(security_conf_dir)

	allowed = [conf.get("dirs", "dss_datadir")]

	additional = _get_option(conf, "dirs", "additional_allowed_file_dirs", "")
	allowed.extend([x.strip() for x in additional.split(";")])

	allowed = [x for x in allowed if len(x) > 0]

	target_canonical = osp.realpath(target_dir)

	for candidate in allowed:
		candidate_canonical = osp.realpath(candidate)

		if target_canonical.startswith(candidate_canonical):
			logging.info("Allowed path: %s in %s" % (target_canonical, candidate_canonical))
			return True

	raise Exception("DSS is not allowed to modify permissions on %s" % target_canonical)

def check_user_allowed(security_conf_dir, target_user):
	conf = safe_read_config(security_conf_dir)

	# Auto-create users if needed
	if _get_option(conf, "users", "auto_create_users", "no") == "yes":
		required_prefix = _get_option(conf, "users", "auto_created_users_prefix", "?")

		if not target_user.startswith(required_prefix):
			raise Exception("Cannot auto-crate user: name does not start with required prefix")

		try:
			logging.info("Auto-create, checking existence of user %s" % target_user)
			pwe = pwd.getpwnam(target_user)
		except KeyError as e:
			logging.info("User %s does not exist, creating it"  % (target_user))

			auto_create_group = _get_option(conf, "users", "auto_created_users_group", "?")
			subprocess.check_call(["/usr/sbin/useradd", target_user, "-g", auto_create_group])

	# Check user existence
	try:
		pwe = pwd.getpwnam(target_user)
	except KeyError as e:
		raise Exception("User %s not found in user database: %s" % (target_user, e))

	# Resolve allowed groups
	allowed_groups = _get_option(conf, "users", "allowed_user_groups", "")
	allowed_groups = [x.strip() for x in allowed_groups.split(";")]
	allowed_gids = []
	for g in allowed_groups:
		if g == '*':
			# Debug only - do not use for production
			logging.warn("Group authorization disabled -> user %s allowed", target_user)
			return True
		elif g.isdigit():
			allowed_gids.append(int(g))
		else:
			try:
				allowed_gids.append(grp.getgrnam(g).gr_gid)
			except KeyError as e:
				logging.warn('Group %s not found in group database: %s', g, e)
	logging.info("Allowed group ids: %s", allowed_gids)

	# Retrieve groups of user
	gids_of_user = subprocess.check_output(["/usr/bin/id", "-G", target_user]).strip().split(b" ")
	gids_of_user = [ int(g) for g in gids_of_user ]
	# Python version:
	# gids_of_user = [ g.gr_gid for g in grp.getgrall() if pwe.pw_name in g.gr_mem ]
	# if pwe.pw_gid not in gids_of_user:
	#   gids_of_user.append(pwe.pw_gid)
	logging.info("User %s belongs to groups: %s", target_user, gids_of_user)

	for gid in allowed_gids:
		if gid in gids_of_user:
			try:
				grnam = grp.getgrgid(gid).gr_name
			except:
				grnam = gid
			logging.info("User %s belongs to group %d (%s) -> allowed", target_user, gid, grnam)
			return True

	logging.error("User %s does not belong to any allowed group --> exec denied", target_user)
	raise Exception("User %s does not belong to any allowed group, intersection of %s and %s is empty --> exec denied" % (target_user, gids_of_user, allowed_gids))

def check_is_dir(path):
	if osp.islink(path) or not osp.isdir(path):
		raise Exception("Not a directory: %s" % path)

# Check user access to a directory pointed to by an environment variable
# Only issue a warning for now
def check_dir_access(varname, dirname):
    if not dirname:
        logging.warn('environment variable not defined or empty: %s' % varname)
        return
    try:
        st = os.stat(dirname)
    except Exception as e:
        logging.error('error checking access to directory %s : %s : %s' % (varname, dirname, e))
        return
    if not stat.S_ISDIR(st.st_mode):
        logging.error('error checking access to directory %s : %s : not a directory' % (varname, dirname))
        return
    if not os.access(dirname, os.X_OK):
        logging.warn('error checking access to directory %s : %s : no traversal access' % (varname, dirname))
