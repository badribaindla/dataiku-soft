/* globals require module */
const stylelint = require("stylelint");

const { report, ruleMessages, validateOptions } = stylelint.utils;
const ruleName = "design-system/no-custom-box-shadow";
const messages = ruleMessages(ruleName, {
    boxShadowUsage: (decl) =>
        `[Design System] Unexpected box-shadow value '${decl.value}'. Use a box-shadow semantic variable prefixed by @dku-shadow-.`,
});

const rule = (primary, secondary, context) => {
    return (postcssRoot, postcssResult) => {
        const validOptions = validateOptions(postcssResult, ruleName, {});

        if (!validOptions) {
            return;
        }

        const isAutoFixing = Boolean(context.fix);

        postcssRoot.walkDecls((decl) => {
            // Iterate CSS declarations
            const isApplicable = decl.prop === "box-shadow";
            const isException = decl.value === "none";

            if (!isApplicable || isException) {
                return;
            }

            const useVariable = decl.value.includes("@dku-shadow-");

            if (!useVariable) {
                if (!isAutoFixing) {
                    report({
                        ruleName,
                        result: postcssResult,
                        message: messages.boxShadowUsage(decl),
                        node: decl,
                    });
                }
            }
        });
    };
};

rule.primaryOptionArray = true;

module.exports = stylelint.createPlugin(ruleName, rule);
module.exports.ruleName = ruleName;
module.exports.messages = messages;
