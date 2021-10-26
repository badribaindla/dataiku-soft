import inspect
import sys


def magic_main(main):
    args = inspect.getargspec(main).args
    argument_strings = " ".join(("<%s>" % argname) for argname in args)
    if len(sys.argv[1:]) != len(args):
        print ("""
            Usage:
                python %s %s
        """ % (sys.argv[0], argument_strings))
        sys.exit(1)
    else:
        main(*sys.argv[1:])


if __name__ == "__main__":
    def main(toto, titi):
        """ This is a test """
        print (toto + " " + titi)
    magic_main(main)
