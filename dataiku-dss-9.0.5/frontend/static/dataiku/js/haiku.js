(function() {
'use strict';

const app = angular.module('dataiku.haiku', []);

const haikus = [
    ["coffee machine", "there are two steaming clouds", "in my mug", "Nicolas Grenier", "http://fr.wikipedia.org/wiki/Nicolas_Grenier"],
    ["Whitecaps on the bay:", "A broken signboard banging", "In the April wind.", "Richard Wright", "https://en.wikipedia.org/wiki/Richard_Wright_(author)"],
    ["like a data artist", "smog in the morning", "today I will be DA", "Nicolas Grenier", "http://fr.wikipedia.org/wiki/Nicolas_Grenier"],
    ["Little spider,", "will you outlive", "me?", "Cor van den Heuvel", "http://en.wikipedia.org/wiki/Cor_van_den_Heuvel" ],
    ["my window", "daily predictive modeling", "in sunny yellow winter", "Nicolas Grenier", "http://fr.wikipedia.org/wiki/Nicolas_Grenier"],
    ["Up, up, down, down, left","Right, left, right, B, A then start", "30 lives for what?",  "Kat Borlongan", "https://twitter.com/KatBorlongan"],
    ["map world", "a flock of seabirds pass", "overhead", "Nicolas Grenier", "http://fr.wikipedia.org/wiki/Nicolas_Grenier"],
    ["In the flow,","a peaceful chirp chirp.", "Data.", "Christophe Bourguignat", "https://twitter.com/chris_bour"],
    ["predictive mindset", "Svalbard Archipelago", "skip a line", "Nicolas Grenier", "http://fr.wikipedia.org/wiki/Nicolas_Grenier"],
    ["Leaves of knowledge","Falling on uneven ground until","The mound becomes a tree of understanding","Ori Pekelman", "https://twitter.com/OriPekelman"],
    ["dataflow", "with these little blue stones",  "I am Hop-o'-My-Thumb", "Nicolas Grenier", "http://fr.wikipedia.org/wiki/Nicolas_Grenier"],
    ["clustering", "multicolored frosty points", "a path", "Nicolas Grenier", "http://fr.wikipedia.org/wiki/Nicolas_Grenier"],
    ["colored bricks", "a grey wave at the end", "my pinboard", "Nicolas Grenier", "http://fr.wikipedia.org/wiki/Nicolas_Grenier"],
    ["typing on the keyboard", "rose mittens and green scarf", "data snows", "Nicolas Grenier", "http://fr.wikipedia.org/wiki/Nicolas_Grenier"],
    ["grey and dull", "well good morning", "I clean the sky","Nicolas Grenier", "http://fr.wikipedia.org/wiki/Nicolas_Grenier"]
];

window.get_haiku_of_the_day = function () {
    var today = new Date();
    var dd = today.getDate();
    var pos = dd % haikus.length;
    var haiku = haikus[pos];
    return {'first':haiku[0],'second':haiku[1],'third':haiku[2],'author':haiku[3], 'link':haiku[4]};
};

})();