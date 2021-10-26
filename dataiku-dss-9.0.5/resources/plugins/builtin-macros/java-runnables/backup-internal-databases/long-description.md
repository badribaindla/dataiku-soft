This macros backups the contents of the internal databases of DSS, so that they can be truncated.

**:warning: Caution** : this macro is not working for externally hosted internal databases.
**:warning: Caution** : this macro will lock the databases while exporting their contents, potentially blocking usage of DSS, for seconds to minutes depending on the databases' size.