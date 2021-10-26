# Welcome to DSS wiki

<img src="/static/dataiku/images/dss-logo-about.png" width="70" style="float: right; margin-right: 30px" />

You can use both [markdown](https://en.wikipedia.org/wiki/Markdown) and [HTML](https://en.wikipedia.org/wiki/HTML)/[CSS](https://en.wikipedia.org/wiki/Cascading_Style_Sheets) syntaxes to format your content. This page is an example of typical uses.

<br />

Among classic markdown features, you can use **bold** or _italic_ text, quotes:

> “Further conceive, I beg, that a stone, while continuing in motion, should be capable of thinking and knowing, that it is endeavoring, as far as it can, to continue to move. Such a stone, being conscious merely of its own endeavor and not at all indifferent, would believe itself to be completely free, and would think that it continued in motion solely because of its own wish. This is that human freedom, which all boast that they possess, and which consists solely in the fact, that men are conscious of their own desire, but are ignorant of the causes whereby that desire has been determined.”
> <div style="text-align: right;font-style:italic">― Baruch Spinoza </div>

<i class="icon-dkubird" /> **DSS** also supports references to DSS objects analogous to classic markdown links:

 1. ```[[other article]]```
 2. ```object_type:id```
 3. ```[displayed name](object_type:id)```


For example:
   - [[Summary]]
   - dataset:my_dataset
   - [Insight](insight:123456)
   - [Model](saved_model:123456)
   - [Project](project:MY_PROJECT)
   - etc

Remember you need two line breaks in your code to actually have a line break in the page and having spaces in the beginning of the line will change the layout (depending on the number of spaces).

---

There are other useful markdown features like tables, emojis, [html entities](https://en.wikipedia.org/wiki/List_of_XML_and_HTML_character_entity_references) and... old school HTML:

| Name         | Hobby       | Pet       |
| ------------ |------------ | ----------|
| Astrid       | fries       | rat       |
| Clément      | computer    | cat       |
| Sonia        | champagne   | chicken   |
| Pierre       | surfer      | palm_tree |

<marquee direction="right">&lt;&gt;&lt;&nbsp;&hellip;</marquee>

And if you wish to include formulae in your wiki article then you can embed LaTex like this:

```math
{\displaystyle \mu (\{x\in X\,:\,\,|f(x)|\geq t\})\leq {1 \over t^{p}}\int _{|f|\geq t}|f|^{p}\,d\mu .}
```

When $`a \ne 0`$, there are two solutions to $`ax^2 + bx + c = 0`$

<div class="alert">
 Note that you can select a wiki article to display in your project home page.
</div>
