/* globals require module */
const stylelint = require("stylelint");

const { report, ruleMessages, validateOptions } = stylelint.utils;
const ruleName = "design-system/no-custom-color";
const messages = ruleMessages(ruleName, {
    colorUsage: (decl, useTooGenericVariable) => {
        if (decl.prop === "color") {
            return useTooGenericVariable
                ? `[Design System] Unexpected ${decl.prop} value "${decl.value}". Replace @grey-lighten variation by a typography mixin from fonts.less or a typography color from color-variables.less if possible.`
                : `[Design System] Unexpected ${decl.prop} value "${decl.value}". Use a typography mixin from fonts.less or a typography color from color-variables.less if possible.`;
        }

        if (decl.prop.includes("background")) {
            return useTooGenericVariable
                ? `[Design System] Unexpected ${decl.prop} value "${decl.value}". Replace @grey-lighten variation by a more accurate background color from color-variables.less if possible.`
                : `[Design System] Unexpected ${decl.prop} value "${decl.value}". Use a background color from color-variables.less if possible.`;
        }

        if (decl.prop.includes("border")) {
            return useTooGenericVariable
                ? `[Design System] Unexpected ${decl.prop} value "${decl.value}". Replace @grey-lighten variation by a more accurate border color from color-variables.less if possible.`
                : `[Design System] Unexpected ${decl.prop} value "${decl.value}". Use a border color from color-variables.less if possible.`;
        }

        return `[Design System] Unexpected ${decl.prop} value "${decl.value}". Use a color from the design system instead if possible.`;
    },
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
            const isMixin = decl.prop.includes("(") || !decl.value;
            if (isMixin) {
                return;
            }
            const isFillOrStroke = Boolean(decl.prop.match(/^(fill|stroke)$/));
            const isApplicable = Boolean(decl.prop.match(/^(color|border|border-color|background|background-color)$/)) || isFillOrStroke;
            const isException =
                decl.value.includes("inherit") ||
                decl.value.includes("transparent") ||
                decl.value.includes("initial") ||
                decl.value.includes("none") ||
                decl.value.includes("unset");
            const isValidBorderValue =
                decl.prop === "border" &&
                ((!decl.value.includes("solid") && !decl.value.includes("dotted")) ||
                    decl.value.includes("trasnparent"));
            const isValidBackgroundValue = decl.prop === "background" && decl.value.includes("url");
            const useVariable = decl.value.includes("@");
            const isValidFillOrStrokeValue = isFillOrStroke && useVariable;

            if (!isApplicable || isException || isValidBorderValue || isValidBackgroundValue || isValidFillOrStrokeValue) {
                return;
            }

            const useTooGenericVariable = decl.value.includes("@grey-lighten-") || decl.value.includes("@grey-base");
            const useProperVariable = decl.value.includes("@") && !useTooGenericVariable;

            if (!useProperVariable) {
                if (!isAutoFixing) {
                    report({
                        ruleName,
                        result: postcssResult,
                        message: messages.colorUsage(decl, useTooGenericVariable),
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
