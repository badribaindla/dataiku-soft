from statsmodels.stats.multitest import multipletests

from dataiku.eda.exceptions import UnknownObjectType


def multitest_correction(pvalues, adjustment_method):
    """
        Adjust p-values when multiple hypothesis are tested at the same time
    """

    if adjustment_method == 'NONE':
        return pvalues

    dku_to_sm = {
        'BONFERRONI': 'bonferroni',
        'HOLM_BONFERRONI': 'holm'
    }

    if adjustment_method not in dku_to_sm:
        raise UnknownObjectType("Unknown adjustment method")

    _, pvalues, _, _ = multipletests(pvalues, method=dku_to_sm[adjustment_method])
    return pvalues
