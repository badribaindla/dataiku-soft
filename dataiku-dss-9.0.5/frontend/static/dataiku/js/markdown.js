(function() {
'use strict';

const app = angular.module('dataiku.markdown', ['dataiku.taggableobjects']);


app.service('Markdown', function($stateParams, $filter, TAGGABLE_TYPES, StateUtils, SmartId, Logger, WT1, ActiveProjectKey) {

/**
 * adapted from marked - a markdown parser
 * Copyright (c) 2011-2013, Christopher Jeffrey. (MIT Licensed)
 * https://github.com/chjj/marked
 */


// Usage report {string: int} corresponding to occurrences of various functionalities
let dkuLastMarkdownUsageReport;

function reportUsage(key) {
    dkuLastMarkdownUsageReport[key] = (dkuLastMarkdownUsageReport[key] || 0) + 1;
}

/**
 * Block-Level Grammar
 */

var block = {
    newline: /^\n+/,
    code: /^( {4}[^\n]+\n*)+/,
    fences: noop,
    hr: /^( *[-*_]){3,} *(?:\n+|$)/,
    heading: /^ *(#{1,6}) *([^\n]+?) *#* *(?:\n+|$)/,
    nptable: noop,
    lheading: /^([^\n]+)\n *(=|-){2,} *(?:\n+|$)/,
    blockquote: /^( *>[^\n]+(\n[^\n]+)*\n*)+/,
    list: /^( *)(bull) [\s\S]+?(?:hr|\n{2,}(?! )(?!\1bull )\n*|\s*$)/,
    html: /^ *(?:comment|closed|closing) *(?:\n{2,}|\s*$)/,
    def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +["(]([^\n]+)[")])? *(?:\n+|$)/,
    table: noop,
    paragraph: /^((?:[^\n]+?(?!hr|heading|lheading|blockquote|tag|def))+)\n*/,
    text: /^[^\n]+/
};

block.bullet = /(?:[*+-]|\d+\.)/;
block.item = /^( *)(bull) [^\n]*(?:\n(?!\1bull )[^\n]*)*/;
block.item = replace(block.item, 'gm')
    (/bull/g, block.bullet)
    ();

block.list = replace(block.list)
    (/bull/g, block.bullet)
    ('hr', /\n+(?=(?: *[-*_]){3,} *(?:\n+|$))/)
();

block._tag = '(?!(?:'
    + 'a|em|strong|small|s|cite|q|dfn|abbr|data|time|code'
    + '|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo'
    + '|span|br|wbr|ins|del|img)\\b)\\w+(?!:/|[^\\w\\s@]*@)\\b';

block.html = replace(block.html)
    ('comment', /<!--[\s\S]*?-->/)
    ('closed', /<(tag)[\s\S]+?<\/\1>/)
    ('closing', /<tag(?:"[^"]*"|'[^']*'|[^'">])*?>/)
    (/tag/g, block._tag)
    ();

block.paragraph = replace(block.paragraph)
    ('hr', block.hr)
    ('heading', block.heading)
    ('lheading', block.lheading)
    ('blockquote', block.blockquote)
    ('tag', '<' + block._tag)
    ('def', block.def)
    ();

/**
 * Normal Block Grammar
 */

block.normal = merge({}, block);

block.dku = {
    paragraph: /^((?:[^\n]+\n?(?!hr|heading|lheading|blockquote|tag|def))+)\n*/,
    text: /^[^\n]+/
};

/**
 * GFM Block Grammar
 */

block.gfm = merge({}, block.normal, {
    fences: /^ *(`{3,}|~{3,}) *(\S+)? *\n([\s\S]+?)\s*\1 *(?:\n+|$)/,
    paragraph: /^/
});

block.gfm.paragraph = replace(block.paragraph)
('(?!', '(?!'
    + block.gfm.fences.source.replace('\\1', '\\2') + '|'
    + block.list.source.replace('\\1', '\\3') + '|'
)();

/**
 * GFM + Tables Block Grammar
 */

block.tables = merge({}, block.gfm, {
    nptable: /^ *(\S.*\|.*)\n *([-:]+ *\|[-| :]*)\n((?:.*\|.*(?:\n|$))*)\n*/,
    table: /^ *\|(.+)\n *\|( *[-:]+[-| :]*)\n((?: *\|.*(?:\n|$))*)\n*/
});

/**
 * Block Lexer
 */

 function Lexer(options) {
    this.tokens = [];
    this.tokens.links = {};
    this.options = options || marked.defaults;
    this.rules = block.normal;

    if (this.options.gfm) {
        if (this.options.tables) {
            this.rules = block.tables;
        } else {
            this.rules = block.gfm;
        }
    }

    if (this.options.noMarkdown) {
        this.rules = block.dku;
    }
}

/**
 * Expose Block Rules
 */

Lexer.rules = block;

/**
 * Static Lex Method
 */

Lexer.lex = function(src, options) {
    var lexer = new Lexer(options);
    dkuLastMarkdownUsageReport = {
        payloadLength: src.length
    };
    return lexer.lex(src);
};

/**
 * Preprocessing
 */

Lexer.prototype.lex = function(src) {
    src = src
        .replace(/\r\n|\r/g, '\n')
        .replace(/\t/g, '    ')
        .replace(/\u00a0/g, ' ')
        .replace(/\u2424/g, '\n');

    return this.token(src, true);
};

/**
 * Lexing
 */

 Lexer.prototype.token = function(src, top) {
    var src = src.replace(/^ +$/gm, '')
        , next
        , loose
        , cap
        , bull
        , b
        , item
        , space
        , i
        , l;

    while (src) {
        // newline
        if (this.rules.newline && (cap = this.rules.newline.exec(src))) {
            src = src.substring(cap[0].length);
            if (cap[0].length > 1) {
                this.tokens.push({
                    type: 'space'
                });
            }
        }

        // code
        if (this.rules.code && (cap = this.rules.code.exec(src))) {
            src = src.substring(cap[0].length);
            cap = cap[0].replace(/^ {4}/gm, '');
            this.tokens.push({
                type: 'code',
                text: !this.options.pedantic
                ? cap.replace(/\n+$/, '')
                : cap
            });

            reportUsage('code');
            continue;
        }

        // fences (gfm)
        if (this.rules.fences && (cap = this.rules.fences.exec(src))) {
            src = src.substring(cap[0].length);
            this.tokens.push({
                type: 'code',
                lang: cap[2],
                text: cap[3]
            });
            continue;
        }

        // heading
        if (this.rules.heading && (cap = this.rules.heading.exec(src))) {
            src = src.substring(cap[0].length);
            this.tokens.push({
                type: 'heading',
                depth: cap[1].length,
                text: cap[2]
            });

            reportUsage('heading' + cap[1].length);
            continue;
        }

        // table no leading pipe (gfm)
        if (top && (this.rules.nptable && (cap = this.rules.nptable.exec(src)))) {
            src = src.substring(cap[0].length);

            item = {
                type: 'table',
                header: cap[1].replace(/^ *| *\| *$/g, '').split(/ *\| */),
                align: cap[2].replace(/^ *|\| *$/g, '').split(/ *\| */),
                cells: cap[3].replace(/\n$/, '').split('\n')
            };

            for (i = 0; i < item.align.length; i++) {
                if (/^ *-+: *$/.test(item.align[i])) {
                    item.align[i] = 'right';
                } else if (/^ *:-+: *$/.test(item.align[i])) {
                    item.align[i] = 'center';
                } else if (/^ *:-+ *$/.test(item.align[i])) {
                    item.align[i] = 'left';
                } else {
                    item.align[i] = null;
                }
            }

            for (i = 0; i < item.cells.length; i++) {
                item.cells[i] = item.cells[i].split(/ *\| */);
            }

            this.tokens.push(item);

            reportUsage('table');
            continue;
        }

        // lheading
        if (this.rules.lheading && (cap = this.rules.lheading.exec(src))) {
            src = src.substring(cap[0].length);
            this.tokens.push({
                type: 'heading',
                depth: cap[2] === '=' ? 1 : 2,
                text: cap[1]
            });
            continue;
        }

        // hr
        if (this.rules.hr && (cap = this.rules.hr.exec(src))) {
            src = src.substring(cap[0].length);
            this.tokens.push({
                type: 'hr'
            });
            continue;
        }

        // blockquote
        if (this.rules.blockquote && (cap = this.rules.blockquote.exec(src))) {
            src = src.substring(cap[0].length);

            this.tokens.push({
                type: 'blockquote_start'
            });

            cap = cap[0].replace(/^ *> ?/gm, '');

            // Pass `top` to keep the current
            // "toplevel" state. This is exactly
            // how markdown.pl works.
            this.token(cap, top);

            this.tokens.push({
                type: 'blockquote_end'
            });

            reportUsage('quote');
            continue;
        }

        // list
        if (this.rules.list && (cap = this.rules.list.exec(src))) {
            src = src.substring(cap[0].length);
            bull = cap[2];

            this.tokens.push({
                type: 'list_start',
                ordered: bull.length > 1
            });

            // Get each top-level item.
            cap = cap[0].match(this.rules.item);

            next = false;
            l = cap.length;
            i = 0;

            for (; i < l; i++) {
                item = cap[i];

                // Remove the list item's bullet
                // so it is seen as the next token.
                space = item.length;
                item = item.replace(/^ *([*+-]|\d+\.) +/, '');

                // Outdent whatever the
                // list item contains. Hacky.
                if (~item.indexOf('\n ')) {
                    space -= item.length;
                    item = !this.options.pedantic
                    ? item.replace(new RegExp('^ {1,' + space + '}', 'gm'), '')
                    : item.replace(/^ {1,4}/gm, '');
                }

                // Determine whether the next list item belongs here.
                // Backpedal if it does not belong in this list.
                if (this.options.smartLists && i !== l - 1) {
                    b = block.bullet.exec(cap[i + 1])[0];
                    if (bull !== b && !(bull.length > 1 && b.length > 1)) {
                        src = cap.slice(i + 1).join('\n') + src;
                        i = l - 1;
                    }
                }

                // Determine whether item is loose or not.
                // Use: /(^|\n)(?! )[^\n]+\n\n(?!\s*$)/
                // for discount behavior.
                loose = next || /\n\n(?!\s*$)/.test(item);
                if (i !== l - 1) {
                    next = item.charAt(item.length - 1) === '\n';
                    if (!loose) loose = next;
                }

                this.tokens.push({
                  type: loose
                  ? 'loose_item_start'
                  : 'list_item_start'
              });

                // Recurse.
                this.token(item, false);

                this.tokens.push({
                  type: 'list_item_end'
              });
            }

            this.tokens.push({
                type: 'list_end'
            });

            reportUsage('list');
            continue;
        }

        // html
        if (this.rules.html && (cap = this.rules.html.exec(src))) {
            src = src.substring(cap[0].length);
            this.tokens.push({
                type: this.options.sanitize ? 'paragraph' : 'html',
                pre: cap[1] === 'pre' || cap[1] === 'script' || cap[1] === 'style',
                text: cap[0]
            });

            reportUsage('html');
            if (cap[0].toLowerCase().includes('<img ')) {
                reportUsage('html_image');
            }
            if (cap[0].toLowerCase().includes('<a ')) {
                reportUsage('html_link');
            }
            continue;
        }

        // def
        if (top && (this.rules.def && (cap = this.rules.def.exec(src)))) {
            src = src.substring(cap[0].length);
            this.tokens.links[cap[1].toLowerCase()] = {
                href: cap[2],
                title: cap[3]
            };
            continue;
        }

        // table (gfm)
        if (top && (this.rules.table && (cap = this.rules.table.exec(src)))) {
            src = src.substring(cap[0].length);

            item = {
                type: 'table',
                header: cap[1].replace(/^ *| *\| *$/g, '').split(/ *\| */),
                align: cap[2].replace(/^ *|\| *$/g, '').split(/ *\| */),
                cells: cap[3].replace(/(?: *\| *)?\n$/, '').split('\n')
            };

            for (i = 0; i < item.align.length; i++) {
                if (/^ *-+: *$/.test(item.align[i])) {
                    item.align[i] = 'right';
                } else if (/^ *:-+: *$/.test(item.align[i])) {
                    item.align[i] = 'center';
                } else if (/^ *:-+ *$/.test(item.align[i])) {
                    item.align[i] = 'left';
                } else {
                    item.align[i] = null;
                }
            }

            for (i = 0; i < item.cells.length; i++) {
                item.cells[i] = item.cells[i]
                .replace(/^ *\| *| *\| *$/g, '')
                .split(/ *\| */);
            }

            this.tokens.push(item);

            reportUsage('table');
            continue;
        }

        // top-level paragraph
        if (top && (this.rules.paragraph && (cap = this.rules.paragraph.exec(src)))) {
            src = src.substring(cap[0].length);
            this.tokens.push({
                type: 'paragraph',
                text: cap[1].charAt(cap[1].length - 1) === '\n'
                ? cap[1].slice(0, -1)
                : cap[1]
            });
            continue;
        }

        // text
        if (this.rules.text && (cap = this.rules.text.exec(src))) {
            // Top-level should never reach here.
            src = src.substring(cap[0].length);
            this.tokens.push({
                type: 'text',
                text: cap[0]
            });
            continue;
        }

        if (src) {
            throw new Error('Infinite loop on byte: ' + src.charCodeAt(0));
        }
    }

    return this.tokens;
};

/**
 * Inline-Level Grammar
 */

var inline = {
    escape: /^\\([\\`*{}\[\]()#+\-.!_>])/,
    autolink: /^<([^ >]+(@|:\/)[^ >]+)>/,
    url: noop,
    tag: /^<!--[\s\S]*?-->|^<\/?\w+(?:"[^"]*"|'[^']*'|[^'">])*?>/,
    link: /^!?\[(inside)\]\(href\)/,
    uploadLink: /^\[(inside)\]{(fileName)}\(href\)/,
    reflink: /^!?\[(inside)\]\s*\[([^\]]*)\]/,
    nolink: /^!?\[((?:\[[^\]]*\]|[^\[\]])*)\]/,
    strong: /^__([\s\S]+?)__(?!_)|^\*\*([\s\S]+?)\*\*(?!\*)/,
    em: /^\b_((?:__|[\s\S])+?)_\b|^\*((?:\*\*|[\s\S])+?)\*(?!\*)/,
    code: /^(`+)\s*([\s\S]*?[^`])\s*\1(?!`)/,
    br: /^ {2,}\n(?!\s*$)/,
    del: noop,
    emoji: noop,
    anchor: noop,
    text: /^[\s\S]+?(?=[\\<!\[_*`$]| {2,}\n|$)/,
    mathInline: noop
};

inline._inside = /(?!\s*\])(?:\\[\[\]]|[^\[\]])+/;
inline._fileName = /(?:{[^}]*}|[^{}]|}(?=[^{]*}))*/;
inline._href = /\s*<?([\s\S]*?)>?(?:\s+['"]([\s\S]*?)['"])?\s*/;

inline.link = replace(inline.link)
    ('inside', inline._inside)
    ('href', inline._href)
    ();

inline.uploadLink = replace(inline.uploadLink)
    ('inside', inline._inside)
    ('fileName', inline._fileName)
    ('href', inline._href)
    ();

inline.reflink = replace(inline.reflink)
    ('inside', inline._inside)
    ();

/**
 * Normal Inline Grammar
 */

inline.normal = merge({}, inline);

/**
 * Pedantic Inline Grammar
 */

inline.pedantic = merge({}, inline.normal, {
  strong: /^__(?=\S)([\s\S]*?\S)__(?!_)|^\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/,
  em: /^_(?=\S)([\s\S]*?\S)_(?!_)|^\*(?=\S)([\s\S]*?\S)\*(?!\*)/
});

const taggableTypes = new RegExp(TAGGABLE_TYPES.join('|'));
inline.dku = {
    autolink: /^<([^ >]+(@|:\/)[^ >]+)>/,
    article: /^\[\[([A-Za-z0-9._]+\.)?([^\.\/]+)\]\]/,
    emoji: /^:([A-Za-z0-9_\-\+]+?):/,
    anchor: /^\{=([^\}]+)\}/,
    mention: /^\@([a-zA-Z0-9@.+_-]{3,80})/,
    taggableObjectRef: /^(type):(id)/i,
    taggableObjectRefWithDisplayName: /^!?\[(inside)\]\((type):(id)\)/i,
    localTag: /^tag:([A-Za-z0-9:_]+)/,
    br: replace(inline.br)('{2,}', '*')(),
    mathInline: /^\$`([^`]*)`\$/
};

inline.dku.taggableObjectRef = replace(inline.dku.taggableObjectRef)
    ('type', taggableTypes)
    ('id', /[A-Za-z0-9._]+/) // too strict for notebooks, but since they allow any character they'll mess up the parsing anyway
    ();
inline.dku.taggableObjectRef = new RegExp(inline.dku.taggableObjectRef, 'i');

inline.dku.taggableObjectRefWithDisplayName = replace(inline.dku.taggableObjectRefWithDisplayName)
    ('inside', inline._inside)
    ('type', taggableTypes)
    ('id', /(\\.|[^)])+/) // since it can be a notebook name, anything goes. Except the ')' which marks the end of the construct
    ();
inline.dku.taggableObjectRefWithDisplayName = new RegExp(inline.dku.taggableObjectRefWithDisplayName, 'i');

inline.dku.article = new RegExp(inline.dku.article, 'i');

inline.dku.mathInline = new RegExp(inline.dku.mathInline, 'i');

/**
 * GFM Inline Grammar
 */

inline.gfm = merge({}, inline.normal, inline.dku, {
    escape: replace(inline.escape)('])', '~|])')(),
    url: /^(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/,
    del: /^~~(?=\S)([\s\S]*?\S)~~/,

    text: replace(inline.text)
    (']|', ':~]|')
    ('|', '|https?://|')
    ('|', '|tag:|')
    ('|', '|dataset:|')
    ('|', '|@|')
    ()
});

inline.dku.text = inline.gfm.text;

/**
 * GFM + Line Breaks Inline Grammar
 */

inline.breaks = merge({}, inline.gfm, {
    br: replace(inline.br)('{2,}', '*')(),
    text: replace(inline.gfm.text)('{2,}', '*')()
});

/**
 * Inline Lexer & Compiler
 */

function InlineLexer(links, options) {
    this.options = options || marked.defaults;
    this.links = links;
    this.rules = inline.normal;
    this.renderer = this.options.renderer || new Renderer;
    this.renderer.options = this.options;

    if (!this.links) {
        throw new Error('Tokens array requires a `links` property.');
    }

    if (this.options.gfm) {
        if (this.options.breaks) {
            this.rules = inline.breaks;
        } else {
            this.rules = inline.gfm;
        }
    } else if (this.options.pedantic) {
        this.rules = inline.pedantic;
    }
    if (this.options.noMarkdown) {
        this.rules = inline.dku;
    }

    this.emojiTemplate = getEmojiTemplate(options);
}

/**
 * Expose Inline Rules
 */

InlineLexer.rules = inline;

/**
 * Static Lexing/Compiling Method
 */

InlineLexer.output = function(src, links, options) {
    var inline = new InlineLexer(links, options);
    return inline.output(src);
};

/**
 * Lexing/Compiling
 */
InlineLexer.prototype.getTarget = function() {
    return this.options.targetBlank ? ' target="_blank"'  : '';
}

InlineLexer.prototype.output = function(src) {
    var out = ''
        , link
        , text
        , href
        , cap
        , tagColor;

    while (src) {
        // escape
        if (this.rules.escape && (cap = this.rules.escape.exec(src))) {
            src = src.substring(cap[0].length);
            out += cap[1];
            continue;
        }

        // autolink
        if (this.rules.autolink && (cap = this.rules.autolink.exec(src))) {
            src = src.substring(cap[0].length);
            if (cap[2] === '@') {
                text = cap[1].charAt(6) === ':'
                    ? this.mangle(cap[1].substring(7))
                    : this.mangle(cap[1]);
                href = this.mangle('mailto:') + text;
            } else {
                text = escape(cap[1]);
                href = text;
            }
            out += this.renderer.link(href, null, text);
            continue;
        }

        // url (gfm)
        if (this.rules.url && (cap = this.rules.url.exec(src))) {
            src = src.substring(cap[0].length);
            text = escape(cap[1]);
            href = text;
            out += this.renderer.link(href, null, text);
            continue;
        }

        // tag
        if (this.rules.tag && (cap = this.rules.tag.exec(src))) {
            src = src.substring(cap[0].length);
            out += this.options.sanitize
                ? escape(cap[0])
                : cap[0];
            continue;
        }

        const baseProjectKey = this.options.projectKey || ActiveProjectKey.get();

        // local project tag (dku)
        if (this.rules.localTag && (cap = this.rules.localTag.exec(src))) {
            src = src.substring(cap[0].length);

            const tag = cap[1];
            const projectKey = baseProjectKey + '*';
            const query = `tag:${tag}%20projectKey:${projectKey}`;
            const href = '/catalog/search/q='+query;
            const color = $filter('tagToColor')(tag);
            const title = "Tag: "+tag;
            out += `<span class="tags"><a class="tag" href="${href}" style="background-color:${color}" ${this.getTarget()} title="${title}">${tag}</a></span>`;

            reportUsage('tag');
            continue;
        }

        // article (dku)
        if (this.rules.article && (cap = this.rules.article.exec(src))) {
            src = src.substring(cap[0].length);

            let pkey = cap[1] ? cap[1].slice(0, -1) : baseProjectKey;
            let id = cap[2];

            const taggableType = 'ARTICLE';
            const icon = $filter('typeToIcon')(taggableType);
            const color = $filter('typeToColor')(taggableType);
            const href = StateUtils.href.dssObject(taggableType, id, pkey, {moveToTargetProject: true});

            let title = "Article ";
            let idSafe = String(id).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            let linkText;
            if (pkey != baseProjectKey) {
                title += idSafe + " from project " + pkey;
                linkText = pkey + "." + idSafe;
            } else {
                title += idSafe;
                linkText = idSafe;
            }

            out += `<a href="${href}" title="${title}" ${this.getTarget()} style="text-decoration:none"><i class="inline-taggable-object-icon ${icon} ${color}" /> ${linkText}</a>`;

            reportUsage('ARTICLE_simple_syntax');
            continue;
        }

        // dku (has to be before link)
        if (this.rules.taggableObjectRefWithDisplayName && (cap = this.rules.taggableObjectRefWithDisplayName.exec(src))) {
            src = src.substring(cap[0].length);

            const displayName = sanitize(cap[1].replace(/\\(.)/g, '$1'));
            const taggableType = cap[2].toUpperCase();
            const smartId = cap[3].replace(/\\(.)/g, '$1');
            const href = StateUtils.href.dssObject(taggableType, smartId, baseProjectKey, {moveToTargetProject: true});
            const icon = $filter('typeToIcon')(taggableType);
            const color = $filter('typeToColor')(taggableType);
            let title = $filter('niceTaggableType')(taggableType)+': ';
            if (smartId.includes('.')) {
                const ref = SmartId.resolve(smartId, baseProjectKey);
                title += ref.id +" from project "+ref.projectKey;
            } else {
                title += smartId;
            }

            out += `<a href="${href}" title="${title}" ${this.getTarget()} style="text-decoration:none"><i class="inline-taggable-object-icon ${icon} ${color}" /> ${displayName}</a>`;

            reportUsage(taggableType);
            continue;
        }

        // link
        if (this.rules.link && (cap = this.rules.link.exec(src))) {
            src = src.substring(cap[0].length);
            out += this.outputLink(cap, {
                title: cap[1],
                href: cap[2]
            });

            //report usage done in outputLink
            continue;
        }

        // uploadLink
        if (this.rules.uploadLink && (cap = this.rules.uploadLink.exec(src))) {
            src = src.substring(cap[0].length);
            out += this.outputFileLink(cap[1], cap[2], cap[3]);

            //report usage done in outputLink
            continue;
        }

        // reflink, nolink
        if ((this.rules.reflink && (cap = this.rules.reflink.exec(src))) || (this.rules.nolink && (cap = this.rules.nolink.exec(src)))) {
            src = src.substring(cap[0].length);
            link = (cap[2] || cap[1]).replace(/\s+/g, ' ');
            link = this.links[link.toLowerCase()];
            if (!link || !link.href) {
                out += cap[0].charAt(0);
                src = cap[0].substring(1) + src;
                continue;
            }
            out += this.outputLink(cap, link);

            //report usage done in outputLink
            continue;
        }

        // strong
        if (this.rules.strong && (cap = this.rules.strong.exec(src))) {
            src = src.substring(cap[0].length);
            out += this.renderer.strong(this.output(cap[2] || cap[1]));

            reportUsage('strong');
            continue;
        }

        // math inline
        if (this.options.math && this.rules.mathInline && (cap = this.rules.mathInline.exec(src))) {
            src = src.substring(cap[0].length);
            out += this.renderer.mathInline(cap[1] || "");
            reportUsage('mathInline');
            continue;
        }

        // em
        if (this.rules.em && (cap = this.rules.em.exec(src))) {
            src = src.substring(cap[0].length);
            out += this.renderer.em(this.output(cap[2] || cap[1]));

            reportUsage('em');
            continue;
        }

        // code
        if (this.rules.code && (cap = this.rules.code.exec(src))) {
            src = src.substring(cap[0].length);
            out += this.renderer.codespan(escape(cap[2], true));

            reportUsage('code');
            continue;
        }

        // br
        if (this.rules.br && (cap = this.rules.br.exec(src))) {
            src = src.substring(cap[0].length);
            out += this.renderer.br();
            continue;
        }

        // del (gfm)
        if (this.rules.del && (cap = this.rules.del.exec(src))) {
            src = src.substring(cap[0].length);
            out += this.renderer.del(this.output(cap[1]));
            continue;
        }

        // emoji (gfm)
        if (this.rules.emoji && (cap = this.rules.emoji.exec(src))) {
            src = src.substring(cap[0].length);
            out += this.emoji(cap[1]);

            reportUsage('emoji');
            continue;
        }

        // dku anchor
        if (this.rules.anchor && (cap = this.rules.anchor.exec(src))) {
            src = src.substring(cap[0].length);
            out += this.anchor(cap[1]);

            reportUsage('anchor');
            continue;
        }

        // dku
        if (this.rules.taggableObjectRef && (cap = this.rules.taggableObjectRef.exec(src))) {
            src = src.substring(cap[0].length);

            const taggableType = cap[1].toUpperCase();
            const smartId = cap[2];
            const href = StateUtils.href.dssObject(taggableType, smartId, baseProjectKey, {moveToTargetProject: true});
            const icon = $filter('typeToIcon')(taggableType);
            const color = $filter('typeToColor')(taggableType);
            let title = $filter('niceTaggableType')(taggableType)+': ';
            if (smartId.includes('.')) {
                const ref = SmartId.resolve(smartId, baseProjectKey);
                title += ref.id +" from project "+ref.projectKey;
            } else {
                title += smartId;
            }


            out += `<a href="${href}" title="${title}" ${this.getTarget()} style="text-decoration:none"><i class="inline-taggable-object-icon ${icon} ${color}" /> ${smartId}</a>`;

            reportUsage(taggableType);
            continue;
        }

        // dku
        if (this.rules.mention && (cap = this.rules.mention.exec(src))) {
            src = src.substring(cap[0].length);

            const login = cap[1];
            const title = "User: "+login;
            out += `<a href="/profile/${login}/" title="${title}">@${login}</a>`;

            reportUsage('userMention');
            continue;
        }

        // text
        if (this.rules.text && (cap = this.rules.text.exec(src))) {
            src = src.substring(cap[0].length);
            out += escape(this.smartypants(cap[0]));
            continue;
        }

        if (src) {
            throw new Error('Infinite loop on byte: ' + src.charCodeAt(0));
        }
    }

    return out;
};

/**
 * Compile Link
 */

InlineLexer.prototype.outputLink = function(cap, link) {
    let href = escape(link.href);
    const title = link.title ? escape(link.title) : null;

    if (cap[0].charAt(0) === '!') {
        reportUsage('image_md');
        return this.renderer.image(href, title, escape(cap[1]));
    } else if (href.includes('/') || (href.match(/(\.)/g) || []).length > 1) {
        reportUsage('link_md');
        return this.renderer.link(href, title, this.output(cap[1]));
    } else if (href.startsWith('#')) {
        reportUsage('anchor_md');
        return this.renderer.link(location.pathname + href, title, this.output(cap[1]));
    } else {
        // Links without `/` and less than two `.` should reference smartIds
         return this.outputFileLink(title, title, href);
    }
};

InlineLexer.prototype.outputFileLink = function (displayName, fileName, href) {
    href = getUploadURL(fileName, href, this.options.projectKey);
    displayName = String(displayName).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    reportUsage('link_to_uploaded_file');
    return `<a href="${href}" title="Click to download" style="text-decoration:none" target="_blank"><i class="icon-download"></i> ${displayName}</a> `;
};

/**
 * Emoji Transformations
 */

function emojiDefaultTemplate(emoji) {
    return '<img src="'
    + '/graphics/emojis/'
    + encodeURIComponent(emoji)
    + '.png"'
    + ' alt=":'
    + escape(emoji)
    + ':"'
    + ' title=":'
    + escape(emoji)
    + ':"'
    + ' class="emoji" align="absmiddle" height="20" width="20">';
}

function getEmojiTemplate(options) {
    if (options.emoji) {
        if (typeof options.emoji === 'function') {
            return options.emoji;
        }
        if (typeof options.emoji === 'string') {
            var emojiSplit = options.emoji.split(/\{emoji\}/g);
            return emoji => emojiSplit.join(emoji);
        }
    }
    return emojiDefaultTemplate;
}

InlineLexer.prototype.emojiTemplate = emojiDefaultTemplate;
InlineLexer.prototype.emoji = function (name) {
    if (!this.options.emoji) {
        return ':' + name + ':';
    }
    return this.emojiTemplate(name);
};
InlineLexer.prototype.anchor = function(name) {
    const anchorName = name.toLowerCase().replace(/[^\w]+/g, '-');
    return '<span class="dku-normal-anchor">'
        + '<a name="'
        + anchorName
        + '"></a>'
        + name
        + Renderer.prototype.link.call(this, location.pathname + '#' + anchorName, anchorName, '<i class="icon-link"></i>')
        + '</span>';
};
InlineLexer.prototype.mention = function (name) {
    return '@' + name;
};

/**
 * Smartypants Transformations
 */

InlineLexer.prototype.smartypants = function(text) {
    if (!this.options.smartypants) return text;
    return text
        // em-dashes
        .replace(/--/g, '\u2014')
        // opening singles
        .replace(/(^|[-\u2014/(\[{"\s])'/g, '$1\u2018')
        // closing singles & apostrophes
        .replace(/'/g, '\u2019')
        // opening doubles
        .replace(/(^|[-\u2014/(\[{\u2018\s])"/g, '$1\u201c')
        // closing doubles
        .replace(/"/g, '\u201d')
        // ellipses
        .replace(/\.{3}/g, '\u2026');
};

/**
 * Mangle Links
 */

InlineLexer.prototype.mangle = function(text) {
    var out = ''
        , l = text.length
        , i = 0
        , ch;

    for (; i < l; i++) {
        ch = text.charCodeAt(i);
        if (Math.random() > 0.5) {
            ch = 'x' + ch.toString(16);
        }
        out += '&#' + ch + ';';
    }

    return out;
};

/**
 * Renderer
 */

function Renderer(options) {
    this.options = options || {};
}

Renderer.prototype.code = function(code, lang, escaped) {
    if (this.options.highlight) {
        const out = this.options.highlight(code, lang);
        if (out != null && out !== code) {
            escaped = true;
            code = out;
        }
    }

    if (!lang) {
        return '<pre><code>'
            + (escaped ? code : escape(code, true))
            + '</code></pre>';
    }

    if (lang === 'math') {
        return '\n<p class="dss-mathjax-block">$math-block\n'
            + code
            + '\n$math-block</p>\n'
    }

    return '<pre><code class="'
        + this.options.langPrefix
        + escape(lang, true)
        + '">'
        + (escaped ? code : escape(code, true))
        + '\n</code></pre>\n';
};

/**
 * Mathjax renderers just prepare the formulae for subsequent processing by MathJax
 * The pre-processing of the $math tags is necessary to prevent the symbols in LaTex formulae being
 * processed by markdown
 */
Renderer.prototype.mathInline = function(formula) {
    return '<span class="dss-mathjax-inline">$math-inline ' + formula + ' $math-inline</span>';
};

Renderer.prototype.blockquote = function(quote) {
    return '<blockquote>\n' + quote + '</blockquote>\n';
};

Renderer.prototype.html = function(html) {
    return html;
};

Renderer.prototype.heading = function(text, level, raw) {
    const baseAnchorName = raw.toLowerCase().replace(/[^\w]+/g, '-');
    if (!this.anchorMap.hasOwnProperty(baseAnchorName)) {
        this.anchorMap[baseAnchorName] = 1;
    } else {
        this.anchorMap[baseAnchorName]++;
    }
    const anchorName = baseAnchorName + '-' + this.anchorMap[baseAnchorName];
    return '<h'
        + level
        + ' id="'
        + this.options.headerPrefix
        + anchorName
        + '" class="dku-header-anchor"><a name="'
        + anchorName
        + '"></a>'
        + text
        + ((this.options.enableAnchors) ? Renderer.prototype.link.call(this, location.pathname + '#' + anchorName, anchorName, '<i class="icon-link"></i>') : '')
        + '</h'
        + level
        + '>\n';
};

Renderer.prototype.hr = function() {
    return '<hr style="break-after:page">\n';
};

Renderer.prototype.list = function(body, ordered) {
        var type = ordered ? 'ol' : 'ul';
        return '<' + type + '>\n' + body + '</' + type + '>\n';
};

Renderer.prototype.listitem = function(text) {
    return '<li>' + text + '</li>\n';
};

Renderer.prototype.paragraph = function(text) {
    return '<p>' + text + '</p>\n';
};

Renderer.prototype.table = function(header, body) {
    return '<table>\n'
        + '<thead>\n'
        + header
        + '</thead>\n'
        + '<tbody>\n'
        + body
        + '</tbody>\n'
        + '</table>\n';
};

Renderer.prototype.tablerow = function(content) {
    return '<tr>\n' + content + '</tr>\n';
};

Renderer.prototype.tablecell = function(content, flags) {
    var type = flags.header ? 'th' : 'td';
    var tag = flags.align
        ? '<' + type + ' style="text-align:' + flags.align + '">'
        : '<' + type + '>';
    return tag + content + '</' + type + '>\n';
};

// span level renderer
Renderer.prototype.strong = function(text) {
    return '<strong>' + text + '</strong>';
};

Renderer.prototype.em = function(text) {
    return '<em>' + text + '</em>';
};

Renderer.prototype.codespan = function(text) {
    return '<code>' + text + '</code>';
};

Renderer.prototype.br = function() {
    return '<br>';
};

Renderer.prototype.del = function(text) {
    return '<del>' + text + '</del>';
};

Renderer.prototype.link = function(href, title, text) {
    if (this.options.sanitize) {
        try {
            var prot = decodeURIComponent(unescape(href))
                .replace(/[^\w:]/g, '')
                .toLowerCase();
        } catch (e) {
            return '';
        }
        if (prot.indexOf('javascript:') === 0) {
            return '';
        }
    }
    var out = '<a href="' + href + '"';
    if (title) {
        out += ' title="' + title + '"';
    }
    if (this.options.targetBlank) {
        out += ' target="_blank"';
    } else {
        // otherwise we force the target to _self in order force-scroll to the same anchor when already in URL
        // if url is ...#anchor1 and ...#anchor1 link is click, it will only scroll to the anchor if target is _self
        out += ' target="_self"';
    }
    out += '>' + text + '</a>';
    return out;
};

function getUploadURL(filename, uploadId, contextProject) {
    try {
        const ref = SmartId.resolve(uploadId, contextProject);
        let sanitizedFilename = filename.replace(/(((\.)+)?\/)/g, "_"); // remove all slashes and dots located before slashes
        return `/dip/api/projects/wikis/get-uploaded-file/${sanitizedFilename}?projectKey=${ref.projectKey}&uploadId=${ref.id}`;
    } catch (e) {
        console.error('Failed to resolve uploadId'); // NOSONAR: OK to use console.
        return '';
    }
}

Renderer.prototype.image = function(href, title, text) {
    if (href && !href.includes('/')) { // only an attachment id will not contain a slash
        href = getUploadURL(text, href, this.options.projectKey);
    }
    var out = '<img src="' + href + '" alt="' + text + '"';
    if (title) {
        out += ' title="' + title + '"';
    }
    out += '>';
    return out;
};

/**
 * Parsing & Compiling
 */

function Parser(options) {
    this.anchorMap = {};
    this.tokens = [];
    this.token = null;
    this.options = options || marked.defaults;
    this.options.renderer = this.options.renderer || new Renderer;
    this.renderer = this.options.renderer;
    this.renderer.options = this.options;
    this.renderer.anchorMap = this.anchorMap;
}

/**
 * Static Parse Method
 */

Parser.parse = function(src, options, renderer) {
    var parser = new Parser(options, renderer);
    return parser.parse(src);
};

/**
 * Parse Loop
 */

Parser.prototype.parse = function(src) {
    this.inline = new InlineLexer(src.links, this.options, this.renderer);
    this.tokens = src.reverse();

    var out = '';
    while (this.next()) {
        out += this.tok();
    }

    return out;
};

/**
 * Next Token
 */

Parser.prototype.next = function() {
    return this.token = this.tokens.pop();
};

/**
 * Preview Next Token
 */

Parser.prototype.peek = function() {
    return this.tokens[this.tokens.length - 1] || 0;
};

/**
 * Parse Text Tokens
 */

Parser.prototype.parseText = function() {
    var body = this.token.text;

    while (this.peek().type === 'text') {
        body += '\n' + this.next().text;
    }

    return this.inline.output(body);
};

/**
 * Parse Current Token
 */

Parser.prototype.tok = function() {
    switch (this.token.type) {
        case 'space': {
            return '';
        }
        case 'hr': {
            return this.renderer.hr();
        }
        case 'heading': {
            return this.renderer.heading(
              this.inline.output(this.token.text),
              this.token.depth,
              this.token.text);
        }
        case 'code': {
            return this.renderer.code(this.token.text,
              this.token.lang,
              this.token.escaped);
        }

        case 'table': {
            var header = ''
                , body = ''
                , i
                , row
                , cell
                , flags
                , j;

            // header
            cell = '';
            for (i = 0; i < this.token.header.length; i++) {
                flags = { header: true, align: this.token.align[i] };
                cell += this.renderer.tablecell(
                    this.inline.output(this.token.header[i]),
                    {header: true, align: this.token.align[i]}
                    );
            }
            header += this.renderer.tablerow(cell);

            for (i = 0; i < this.token.cells.length; i++) {
                row = this.token.cells[i];

                cell = '';
                for (j = 0; j < row.length; j++) {
                    cell += this.renderer.tablecell(
                        this.inline.output(row[j]),
                        { header: false, align: this.token.align[j] }
                    );
                }

                body += this.renderer.tablerow(cell);
            }
            return this.renderer.table(header, body);
        }
        case 'blockquote_start': {
            var body = '';

            while (this.next().type !== 'blockquote_end') {
                body += this.tok();
            }

            return this.renderer.blockquote(body);
        }
        case 'list_start': {
            var body = ''
            , ordered = this.token.ordered;

            while (this.next().type !== 'list_end') {
                  body += this.tok();
            }

            return this.renderer.list(body, ordered);
        }
        case 'list_item_start': {
            var body = '';

            while (this.next().type !== 'list_item_end') {
                body += this.token.type === 'text'
                    ? this.parseText()
                    : this.tok();
            }

            return this.renderer.listitem(body);
        }
        case 'loose_item_start': {
            var body = '';

            while (this.next().type !== 'list_item_end') {
                body += this.tok();
            }

            return this.renderer.listitem(body);
        }
        case 'html': {
            var html = !this.token.pre && !this.options.pedantic
                ? this.inline.output(this.token.text)
                : this.token.text;
            return this.renderer.html(html);
        }
        case 'paragraph': {
            return this.renderer.paragraph(this.inline.output(this.token.text));
        }
        case 'text': {
            return this.renderer.paragraph(this.parseText());
        }
    }
};

/**
 * Helpers
 */

 function escape(html, encode) {
    return html
        .replace(!encode ? /&(?!#?\w+;)/g : /&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function unescape(html) {
    return html.replace(/&([#\w]+);/g, function(_, n) {
        n = n.toLowerCase();
        if (n === 'colon') return ':';
        if (n.charAt(0) === '#') {
            return n.charAt(1) === 'x'
                ? String.fromCharCode(parseInt(n.substring(2), 16))
                : String.fromCharCode(+n.substring(1));
        }
        return '';
    });
}

function replace(regex, opt) {
    regex = regex.source;
    opt = opt || '';
    return function self(name, val) {
        if (!name) return new RegExp(regex, opt);
        val = val.source || val;
        val = val.replace(/(^|[^\[])\^/g, '$1');
        regex = regex.replace(name, val);
        return self;
    };
}

function noop() {}
noop.exec = noop;

function merge(obj) {
    var i = 1
    , target
    , key;

    for (; i < arguments.length; i++) {
        target = arguments[i];
        for (key in target) {
            if (Object.prototype.hasOwnProperty.call(target, key)) {
                obj[key] = target[key];
            }
        }
    }

    return obj;
}


/**
 * Marked
 */
function marked(src, opt, callback) {
    if (callback || typeof opt === 'function') {
        if (!callback) {
            callback = opt;
            opt = null;
        }

        opt = merge({}, marked.defaults, opt || {});

        var highlight = opt.highlight
            , tokens
            , pending
            , i = 0;

        try {
            tokens = Lexer.lex(src, opt);
        } catch (e) {
            return callback(e);
        }
        pending = tokens.length;

        var done = function() {
            var out, err;

            try {
                out = Parser.parse(tokens, opt);
            } catch (e) {
                err = e;
            }

            opt.highlight = highlight;

            return err
                ? callback(err)
                : callback(dkuLastMarkdownUsageReport, out);
        };


        if (!highlight || highlight.length < 3) {
            return done();
        }

        delete opt.highlight;

        if (!pending) return done();

        for (; i < tokens.length; i++) {
            (function(token) {
                if (token.type !== 'code') {
                    return --pending || done();
                }
                return highlight(token.text, token.lang, function(err, code) {
                    if (code == null || code === token.text) {
                        return --pending || done();
                    }
                    token.text = code;
                    token.escaped = true;
                    --pending || done();
                });
            })(tokens[i]);
        }
        return;
    }
    try {
        if (opt) opt = merge({}, marked.defaults, opt);
        return Parser.parse(Lexer.lex(src, opt), opt);
    } catch (e) {
        if ((opt || marked.defaults).silent) {
            return '<p>An error occurred:</p><pre>'
                + escape(e.message + '', true)
                + '</pre>';
        }
        throw e;
    }
}

/**
 * Options
 */

 marked.options =
 marked.setOptions = function(opt) {
    merge(marked.defaults, opt);
    return marked;
};

marked.defaults = {
    gfm: true,
    emoji: false,
    tables: true,
    breaks: false,
    pedantic: false,
    sanitize: false,
    smartLists: false,
    silent: false,
    highlight: null,
    langPrefix: 'lang-',
    smartypants: false,
    headerPrefix: '',
    enableAnchors: false,
    renderer: new Renderer,
    $scope : null,
    math: true
};

/**
 * Expose
 */

marked.Parser = Parser;
marked.parser = Parser.parse;

marked.Renderer = Renderer;

marked.Lexer = Lexer;
marked.lexer = Lexer.lex;

marked.InlineLexer = InlineLexer;
marked.inlineLexer = InlineLexer.output;

marked.parse = marked;

window.marked = marked;

});


app.service('MarkedSettingService', function(CachedAPICalls) {
    let emojisTable;
    CachedAPICalls.emojisTable.then(function(data) {
        emojisTable = data;
    });
    this.get = function(scope, attrs) {
        return {
            $scope: scope,
            emoji: function (emoji) {
                return emoji in emojisTable ? emojisTable[emoji] : (':'+emoji+':');
            },
            noMarkdown: !!attrs.noMarkdown,
            targetBlank: scope.$eval(attrs.targetBlank),
            pedantic: true,
            projectKey: attrs.projectKey,
            math: !attrs.noMath,
            enableAnchors: scope.$eval(attrs.enableAnchors)
        }
    };
});

app.service('MathJaxService', function($timeout, $stateParams, LoggerProvider) {
    const svc = this;
    svc.isLoaded = false;

    function ensureScriptsLoaded() {
        if (svc.isLoaded) {
            return;
        }
        svc.isLoaded = true;

        let script = document.createElement("script");
        script.type = "text/javascript";
        script.src = "bower_components/mathjax/es5/tex-chtml.js";

        window.MathJax = {
            tex: {
                inlineMath: [['$math-inline', '$math-inline']],
                displayMath: [['$math-block', '$math-block']]
            },
            options: {
                renderActions: {
                    addMenu: [0, '', '']
                }
            },
            startup: {}
        };

        document.getElementsByTagName("head")[0].appendChild(script);

    }

    svc.typesetElement = function(element, htmlTxt) {
        if (htmlTxt.indexOf("$math-") === -1) {
            return;
        }
        ensureScriptsLoaded();

        if (MathJax.startup.promise) {
            MathJax.startup.promise = MathJax.startup.promise
                .then(() => {
                    return MathJax.typesetPromise(element)
                })
                .catch((err) => {
                    Logger.error('MathJax typeset failed',  err)
                });
        }
    }
});


app.directive('fromMarkdown', function($dkuSanitize, CachedAPICalls, MarkedSettingService, MathJaxService) {
    return {
        restrict: 'A',
        link: function (scope, element, attrs) {
            scope.$watch(attrs.fromMarkdown, function (newVal) {
                CachedAPICalls.emojisTable.then(function(emojisTable) {
                    let htmlified = "";
                    marked.setOptions(MarkedSettingService.get(scope, attrs));
                    if (newVal) {
                        if (attrs.wordsLimit) {
                            let words = newVal.split(' ');
                            if (words.length > attrs.wordsLimit) {
                                newVal= words.slice(0, attrs.wordsLimit).join(' ');
                                newVal += '...'; 
                            }
                        }
                        htmlified = marked(newVal, {projectKey: attrs.projectKey});
                        element.html(newVal ? $dkuSanitize(htmlified) : '');
                    } else if (attrs.ifEmpty) {
                        element.html($("<span class=\"empty\" />").html(attrs.ifEmpty));
                    } else {
                        element.html("");
                    }
                    if (attrs.mdCallback) {
                        const callback = scope.$eval(attrs.mdCallback);
                        if (typeof callback == 'function') {
                            callback();
                        }
                    }

                    if (marked.defaults.math){
                        MathJaxService.typesetElement(element, htmlified)
                    }
                });
            });
        }
    };
});


app.directive('autocompletableTextarea', function(DataikuAPI, $timeout, $rootScope, $stateParams, $compile, CachedAPICalls, TAGGABLE_TYPES, Debounce, SmartId, CreateModalFromTemplate) {
    return {
        scope: false,
        link: {
            pre: function($scope, element, attrs) {
                let cm = null;
                $scope.uiState = $scope.uiState || {};
                $scope.uiState.users = null;
                $scope.uiState.emojis = null;

                const MAX_HINT_LENGTH = 100;

                CachedAPICalls.emojisTable.then(function(data) {
                    $scope.uiState.emojis = data;
                });
                DataikuAPI.security.listUsers($stateParams.projectKey).noSpinner()
                .success(function(data) {
                    $scope.uiState.users = data;
                })
                .error(setErrorInScope.bind($scope));

                function getEmojiHint(editor, emojis, curToken, cursor) {
                    const emojiStartPos = curToken.string.lastIndexOf(':');
                    const susbstr = curToken.string.substring(emojiStartPos);
                    let completions = [];
                    angular.forEach(emojis, function(code, name) {
                        const emoji = ':'+name+': ';
                        if (emoji.includes(susbstr) && emoji.length > susbstr.length) {
                            completions.push({code, name, emoji});
                        }
                    });
                    completions.splice(MAX_HINT_LENGTH);
                    completions = completions.map(function(emoji) {
                        return {text:(emoji.emoji + ' '), className:'emoji-dropdown-option', render:function(elt, data, cur) {
                            const div = document.createElement("div");
                            const span1 = document.createElement("span");
                            span1.className = "emoji";
                            span1.textContent = String.fromCodePoint(parseInt(emoji.code.replace("&#x", "").replace(";", ""), 16));
                            const span2 = document.createElement("span");
                            span2.className = "display-name";
                            span2.textContent = emoji.emoji;
                            div.appendChild(span1);
                            div.appendChild(span2);
                            elt.append(div);
                        }};
                    });
                    return {
                        list: completions,
                        from: {
                            line: cursor.line,
                            ch: curToken.start + emojiStartPos
                        },
                        to: {
                            line: cursor.line,
                            ch: curToken.end
                        }
                    };
                }

                function getMentionHint(editor, users, curToken, cursor) {
                    const mentionStartPos = curToken.string.lastIndexOf('@');
                    const mentionStart = curToken.string.substring(mentionStartPos).toLowerCase();
                    let completions = users.filter(function(user) {
                        const mentionLogin = '@' + user.login.toLowerCase();
                        const mentionName = '@' + user.displayName.toLowerCase();
                        return (mentionLogin.startsWith(mentionStart) && mentionLogin.length > mentionStart.length) ||
                        (mentionName.startsWith(mentionStart) && mentionName.length > mentionStart.length);
                    });
                    completions.splice(MAX_HINT_LENGTH);
                    completions = completions.map(function(user) {
                        return {text:'@'+user.login+' ', className:'mention-dropdown-option', render:function(elt, data, cur) {
                            const newScope = $scope.$new();
                            user.mentionLogin = '@' + user.login;
                            newScope.user = user;
                            const subElt = $compile('<div><span class="avatar20" user-picture="user.login" size="20" ></span><span class="display-name" ng-bind="user.displayName"></span><span class="mention" ng-bind="user.mentionLogin"></span></div>')(newScope);
                            subElt.appendTo(elt);
                        }};
                    });

                    return {
                        list: completions,
                        from: {
                            line: cursor.line,
                            ch: curToken.start + mentionStartPos
                        },
                        to: {
                            line: cursor.line,
                            ch: curToken.end
                        }
                    };
                }

                function shouldShowMentionHint(curToken) {
                    if (!$scope.uiState.users) return;
                    return curToken.string && curToken.string.startsWith('@');
                }

                function shouldShowTaggableObjectHint(curToken) {
                    for (const type of TAGGABLE_TYPES) {
                        if (curToken.string && curToken.string.toLowerCase().includes(type.toLowerCase()+':')) {
                            return true;
                        }
                    }
                    return false;
                }

                function shouldShowEmojiHint(curToken) {
                    if (!$scope.uiState.emojis) return;
                    return curToken.string && curToken.string.startsWith(':');
                }

                function anyHint(editor, options) {
                    const cursor = editor.getCursor();
                    const curToken = editor.getTokenAt(cursor);

                    if (shouldShowMentionHint(curToken)) {
                        return getMentionHint(editor, $scope.uiState.users, curToken, cursor);
                    } else if (shouldShowTaggableObjectHint(curToken)) {
                    // no autocomplete for taggable objects for now
                } else if (shouldShowEmojiHint(curToken)) {
                    return getEmojiHint(editor, $scope.uiState.emojis, curToken, cursor);
                }
                return {
                    list: [],
                    from: {
                        line: cursor.line,
                        ch: curToken.start
                    },
                    to: {
                        line: cursor.line,
                        ch: curToken.end
                    }
                };
            }

            function openAutoComplete() {
                if ($('.CodeMirror-hints').size() > 0) {
                        return; // menu already shown
                    }
                    CodeMirror.showHint(cm, anyHint, {completeSingle: false, completeOnSingleClick: true});
                }

                function setupAutocompletion(editor) {
                    cm = editor;
                    if ($scope.$eval(attrs.resizable) != false) {
                        const x = $(cm.getWrapperElement());
                        x.resizable({maxWidth : x.innerWidth()});
                        // TODO @markdown change maxWidth when the window is resized
                    }

                    // plug in autocompletion
                    cm.on('keyup', function(editor, event) {
                        const cursor = editor.getCursor();
                        const curToken = editor.getTokenAt(cursor);
                        if (curToken.string && (curToken.string == '@' || curToken.string == ':')) {
                            openAutoComplete(); // will load users if needed
                        }
                    });
                }

                function setupEditorActions(editor) {
                    cm = editor;
                    let editInCodeMirror = function(editionFn) {
                        if (editionFn) {
                            editionFn(editor);
                            editor.focus();
                        }
                    };
                    $scope.editorActions = {};
                    editor.editorActions = $scope.editorActions;
                    $scope.editorActions.replaceInEditor = function(fn, insertInside=false, method='around') {
                        const prevString = editor.getSelection();
                        const prevSelection = editor.getCursor();
                        const remplacement = fn(prevString);
                        editor.replaceSelection(remplacement, method);
                        if (insertInside && !prevString.length) {
                            prevSelection.ch += remplacement.length / 2;
                            editor.setCursor(prevSelection);
                        }
                        editor.focus();
                    };
                    $scope.editorActions.handleInEditor = function(fn) {
                        fn(editor);
                        editor.focus();
                    };
                    // the item is is based on an attachment item (smartID based + details enriched object)
                    $scope.editorActions.insertReference = function(item, insertInside=false, method='around') {
                        $scope.editorActions.replaceInEditor(function(prevString, useFullId = false) {
                            const tt = item.taggableType.toLowerCase();
                            const obj = SmartId.resolve(item.smartId, $stateParams.projectKey);
                            let label = (tt != 'project' && obj.projectKey != $stateParams.projectKey) ? (obj.projectKey + '.') : '';
                            label += (item.details && item.details.objectDisplayName) || obj.id;
                            return `[${prevString || label.replace(/\]/g, '\\]').replace(/\[/g, '\\[')}](${tt}:${item.smartId.replace(/\)/g, '\\)')})`;
                        }, insertInside, method);
                    };
                    $scope.editorActions.bold = function() {
                        $scope.editorActions.replaceInEditor(function(prevString) {
                            const alreadyMode1 = prevString.slice(0, 2) === '**' && prevString.slice(-2) === '**';
                            const alreadyMode2 = prevString.slice(0, 3) === ' **' && prevString.slice(-3) === '** ';
                            if (alreadyMode2) {
                                return prevString.slice(3, -3);
                            } else if (alreadyMode1) {
                                return prevString.slice(2, -2);
                            } else {
                                return ' **' + prevString + '** ';
                            }
                        }, true);
                    };
                    $scope.editorActions.italic = function() {
                        $scope.editorActions.replaceInEditor(function(prevString) {
                            const alreadyMode1 = prevString.slice(0, 1) === '_' && prevString.slice(-1) === '_';
                            const alreadyMode2 = prevString.slice(0, 2) === ' _' && prevString.slice(-2) === '_ ';
                            if (alreadyMode2) {
                                return prevString.slice(2, -2);
                            } else if (alreadyMode1) {
                                return prevString.slice(1, -1);
                            } else {
                                return ' _' + prevString + '_ ';
                            }
                        }, true);
                    };
                    $scope.editorActions.headline = function() {
                        $scope.editorActions.handleInEditor(cm => {
                            const doc = cm.getDoc();
                            const cursorStart = doc.getCursor(true);
                            const cursorEnd = doc.getCursor(false);
                            for (let lineNb = cursorStart.line; lineNb <= cursorEnd.line; lineNb++) {
                                const line = doc.getLine(lineNb);
                                const pos = {
                                    line: lineNb,
                                    ch: 0
                                };
                                doc.replaceRange('#' + (line.match(/^#+ /) ? '' : ' '), pos);
                            }
                        });
                    };
                    $scope.editorActions.quote = function() {
                        $scope.editorActions.handleInEditor(cm => {
                            const doc = cm.getDoc();
                            const cursorStart = doc.getCursor(true);
                            const cursorEnd = doc.getCursor(false);
                            for (let lineNb = cursorStart.line; lineNb <= cursorEnd.line; lineNb++) {
                                const pos = {
                                    line: lineNb,
                                    ch: 0
                                };
                                doc.replaceRange('> ', pos);
                            }
                        });
                    };
                    $scope.editorActions.code = function() {
                        $scope.editorActions.replaceInEditor(function(prevString) {
                            const already = prevString.slice(0, 3) === '```' && prevString.slice(-3) === '```';
                            return already ? prevString.slice(3, -3) : '```' + prevString + '```';
                        }, true);
                    };
                    $scope.editorActions.list = function() {
                        $scope.editorActions.handleInEditor(cm => {
                            const doc = cm.getDoc();
                            const cursorStart = doc.getCursor(true);
                            const cursorEnd = doc.getCursor(false);
                            for (let lineNb = cursorStart.line; lineNb <= cursorEnd.line; lineNb++) {
                                const line = doc.getLine(lineNb);
                                const pos = {
                                    line: lineNb,
                                    ch: line.search(/\S|$/)
                                };
                                doc.replaceRange(' - ', pos);
                            }
                        });
                    };
                    $scope.editorActions.listOl = function() {
                        $scope.editorActions.handleInEditor(cm => {
                            const doc = cm.getDoc();
                            const cursorStart = doc.getCursor(true);
                            const cursorEnd = doc.getCursor(false);
                            for (let lineNb = cursorStart.line; lineNb <= cursorEnd.line; lineNb++) {
                                const line = doc.getLine(lineNb);
                                const pos = {
                                    line: lineNb,
                                    ch: line.search(/\S|$/)
                                };
                                doc.replaceRange(' ' + (1 + lineNb - cursorStart.line) + '. ', pos);
                            }
                        });
                    };
                    $scope.editorActions.linkOrPicture = function(isPicture) {
                        CreateModalFromTemplate("/templates/markdown/add-editor-link-picture-modal.html", angular.extend($scope, {isPicture: isPicture, cm: editor}));
                    };
                    $scope.editorActions.dssObject = function() {
                        CreateModalFromTemplate("/templates/markdown/add-editor-dss-object-modal.html", angular.extend($scope, {cm: editor}));
                    };
                }

                function setupTooltipToolbar(editor) {
                    cm = editor;
                    const template = '<div class="dku-codemirror-tooltip-toolbar" include-no-scope="/templates/markdown/autocompletable-textarea-toolbar.html"></div>';
                    const toolbarNode = $compile(template)(angular.extend($scope, {tooltipsOnSide: true})).get(0);
                    const debounceFn = Debounce().withScope($scope).withDelay(100, 100).wrap((headRange) => editor.addWidget(headRange, toolbarNode, false));
                    editor.on('beforeSelectionChange', function(editor, evt) {
                        if (toolbarNode && toolbarNode.parentNode) {
                            toolbarNode.parentNode.removeChild(toolbarNode);
                        }
                        if (!evt.ranges.length) {
                            return;
                        }
                        const range = evt.ranges[0];
                        if (range.empty()) {
                            return;
                        }
                        // compute the difference between the cursor position and the right and bottom border, to apply a negative margin on the toolbar to make it always appears
                        const editorWidth = cm.getWrapperElement().offsetWidth;
                        const editorHeight = cm.getWrapperElement().offsetHeight;
                        const toolbarWidth = 300;
                        const toolbarHeight = 26;
                        const localCoords = editor.cursorCoords(range.head, 'local');
                        // compute nagative left margin to prevent overflow at the right side of the editor
                        toolbarNode.style['margin-left'] = '-' + Math.max(0, localCoords.left - (editorWidth - toolbarWidth)) + 'px';
                        // put the toolbar above the cursor when it overflows at the bottom side of the editor and there is space on top of the cursor
                        toolbarNode.style['margin-top'] = (localCoords.top + editor.defaultTextHeight() >= (editorHeight - toolbarHeight) && localCoords.top > toolbarHeight) ? '-42px' : '0';
                        // resize the editor height if the toolbar overflows at the bottom of the editor and there is no space on the top of the cursor
                        if (localCoords.top + editor.defaultTextHeight() >= (editorHeight - toolbarHeight) && localCoords.top <= toolbarHeight) {
                            cm.setSize(editorWidth, editorHeight + toolbarHeight);
                        }
                        debounceFn(range.head);
                    });
                }

                $scope.clearTextarea = function() {
                    $timeout(function() {cm.setValue('');}); // otherwise ugly things with codemirror and angular's digest happen
                };

                $scope.editorOptions = {
                    mode: attrs.noMarkdown ? 'text' : 'text/x-markdown',
                    indentUnit: 2,
                    lineNumbers : false,
                    lineWrapping : true,
                    foldGutter : false,
                    matchBrackets: true,
                    height: 'dynamic',
                    minHeight: '100px',
                    autofocus: true,
                    onLoad: function(editor) {
                        cm = editor;
                        setupAutocompletion(editor);
                        setupEditorActions(editor);
                        if (!attrs.hasOwnProperty('noTooltipToolbar')) {
                            setupTooltipToolbar(editor);
                        }
                    },
                    extraKeys: { // note : no need for ctrl/meta-enter handling here, it's done with a ui-keydown in the template
                    "Tab": "indentMore",
                    "Shift-Tab": "indentLess",
                    "Ctrl-Space": openAutoComplete
                }
            };
            if (attrs.options) {
                angular.extend($scope.editorOptions, $scope.$eval(attrs.options));
            }
        }
    }
};
});

app.controller('AddEditorLinkPictureModalController', function($scope) {
    if (!$scope.cm) {
        throw new Error('CodeMirror object is not in scope');
    }
    const s = $scope.cm.getSelection();
    const isUrl = s.match(/^[a-zA-Z]+:\/\//);
    $scope.new = {
        label: isUrl ? '' : s,
        url: isUrl ? s : ''
    };

    $scope.add = function() {
        $scope.editorActions.replaceInEditor(function(prevString) {
            return ($scope.isPicture ? '!' : '') + '[' + $scope.new.label.replace(/(\[|\])/g, '\\$1').replace() + '](' + $scope.new.url + ')';
        });
        $scope.resolveModal();
    };
});


app.controller('AddEditorDSSObjectModalController', function($scope, $stateParams, DataikuAPI, TAGGABLE_TYPES, SmartId) {
    if (!$scope.cm) {
        throw new Error('CodeMirror object is not in scope');
    }
    $scope.taggableTypes = TAGGABLE_TYPES;

    $scope.newReference = {
        projectKey: $stateParams.projectKey
    };

    $scope.uiState = {
        selectedObject: {},
        selectedProject: {}
    };

    $scope.$watch('newReference.projectKey', function(nv) {
        if (!nv) return;
        DataikuAPI.taggableObjects.listAccessibleObjects(nv).then(function(resp) {
            const objList = resp.data;
            $scope.taggableTypesWithNoItems = TAGGABLE_TYPES.filter(t => t != 'PROJECT' && !objList.find(obj => obj.type == t));
        });
    });

    $scope.addReference = function() {
        $scope.editorActions.replaceInEditor(function(prevString) {
            const tt = $scope.newReference.taggableType.toLowerCase();
            if (tt == 'project') {
                $scope.newReference.id = $scope.newReference.projectKey;
            }
            const objSmartId = SmartId.fromTor($scope.newReference);
            let label = (tt != 'project' && $scope.newReference.projectKey != $stateParams.projectKey) ? ($scope.newReference.projectKey + '.') : '';
            label += (tt == 'project' ? $scope.uiState.selectedProject.name : $scope.uiState.selectedObject.label) || $scope.newReference.id;
            return `[${prevString || label.replace(/\]/g, '\\]').replace(/\[/g, '\\[')}](${tt}:${objSmartId.replace(/\)/g, '\\)')})`;
        });
        $scope.resolveModal();
    };
});

})();
