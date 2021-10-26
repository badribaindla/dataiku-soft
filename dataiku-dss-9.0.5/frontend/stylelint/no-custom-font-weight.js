/* globals require module */
const stylelint = require("stylelint");

const { report, ruleMessages, validateOptions } = stylelint.utils;
const ruleName = "design-system/no-custom-font-weight";
const messages = ruleMessages(ruleName, {
    fontWeightUsage: (decl) =>
        `[Design System] Unexpected font-weight value '${decl.value}'. Use a typography mixin from fonts.less or a font-weight variable from fonts-variables.less.`,
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
            const isApplicable = decl.prop === "font-weight";
            const isException = decl.value === "inherit" || decl.value === "@weight"; // @weight used in mx-ssp mixin

            if (!isApplicable || isException) {
                return;
            }

            const useVariable = decl.value.includes("@font-weight-");

            if (!useVariable) {
                if (!isAutoFixing) {
                    report({
                        ruleName,
                        result: postcssResult,
                        message: messages.fontWeightUsage(decl),
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
