// FORCE LAYOUT WITH D3.JS //
// Some sample data for the visualization
// with initial positions
var sample_graph = {
    "nodes": [  { "x": 200, "y": 270},
                { "x": 600, "y": 50 },
                { "x": 205, "y": 27 },
                { "x":  98, "y": 36 },
                { "x":  84, "y": 10 }
             ],
    "links": [  
                { "target":  1, "source":  0 },
                { "target":  2, "source":  1 },
                { "target":  3, "source":  4 },
             ]
    };
        
// dimensions of the visualization
var width = 640,
    height = 480;

// Creating an SVG container to hold the visualization
 var svg = d3.select('div#d3graph').append('svg')
    .attr('width', width)
    .attr('height', height);

// Extract the nodes and links from the data.
var nodes = sample_graph.nodes,
    links = sample_graph.links;

// Now we create a force layout object and define its properties.
// Those include the dimensions of the visualization and the arrays
// of nodes and links.
var force = d3.layout.force()
    .size([width, height])
    .nodes(nodes)
    .links(links);
     
// Always create the links elements first
var link = svg.selectAll('.link')
    .data(links)
    .enter().append('line')
    .attr('class', 'link');

// then the nodes
var node = svg.selectAll('.node')
    .data(nodes)
    .enter().append('circle')
    .attr('class', 'node');

// parameter defines the
// distance (normally in pixels) that we'd like to have between
// nodes that are connected.
force.linkDistance(100);
     
// set the function defines how objects are shown
// in the chart. This will be launched whenever
// force layout compute a new position for the nodes
force.on('tick', function() {

    // position and size of nodes
    node.attr('r', 10)
        .attr('cx', function(d) { return d.x; })
        .attr('cy', function(d) { return d.y; });

    // position and size of links
    link.attr('x1', function(d) { return d.source.x; })
        .attr('y1', function(d) { return d.source.y; })
        .attr('x2', function(d) { return d.target.x; })
        .attr('y2', function(d) { return d.target.y; });

});


// start computation
force.start();