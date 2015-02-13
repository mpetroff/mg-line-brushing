/**
  Brushing for line charts
*/

var brushHistory = {};

MG.add_hook('global.defaults', function(args) {
  args.brushing = true;
});

function brushing() {
    var args = this.args,
        chartContext = this;

    if (args.brushing === false) {
        return this;
    }

    if (!brushHistory[args.target] || !brushHistory[args.target].brushed) {
        brushHistory[args.target] = {
            brushed: false,
            steps: [],
            original: {
                min_x: args.processed.min_x,
                max_x: args.processed.max_x,
                min_y: args.processed.min_y,
                max_y: args.processed.max_y
            }
        };
    }

    var isDragging = false,
        mouseDown = false,
        originX,
        svg = d3.select(args.target).select('svg'),
        rollover = svg.select('.mg-rollover-rect, .mg-voronoi'),
        brushingGroup,
        extentRect;

    rollover.classed('mg-brush-container', true);

    brushingGroup = rollover.insert('g', '*')
        .classed('mg-brush', true);

    extentRect = brushingGroup.append('rect')
        .attr({
            opacity: 0,
            y: args.top,
            height: args.height - args.bottom - args.top - args.buffer
        })
        .classed('mg-extent', true);

    // mousedown, start area selection
    svg.on('mousedown', function() {
        mouseDown = true;
        isDragging = false;
        originX = d3.mouse(this)[0];
        svg.classed('mg-brushed', false);
        svg.classed('mg-brushing-in-progress', true);
        extentRect.attr({
            x: d3.mouse(this)[0],
            opacity: 0,
            width: 0
        });
    });

    // mousemove / drag, expand area selection
    svg.on('mousemove', function() {
        if (mouseDown) {
            isDragging = true;
            rollover.classed('mg-brushing', true);

            var mouseX = d3.mouse(this)[0],
                newX = Math.min(originX, mouseX),
                width = Math.max(originX, mouseX) - newX;

            extentRect.attr({
                x: newX,
                width: width,
                opacity: 1
            });
        }
    });

    // mouseup, finish area selection
    svg.on('mouseup', function() {
        mouseDown = false;
        svg.classed('mg-brushing-in-progress', false);

        var xScale = args.scales.X,
            yScale = args.scales.Y,
            flatData = [].concat.apply([], args.data),
            boundedData,
            yBounds,
            xBounds,
            extentX0 = +extentRect.attr('x'),
            extentX1 = extentX0 + (+extentRect.attr('width')),
            interval = get_brush_interval(args),
            offset = 0,
            mapDtoX = function(d) { return d[args.x_accessor]; },
            mapDtoY = function(d) { return d[args.y_accessor]; };

        // if we're zooming in: calculate the domain for x and y axes based on the selected rect
        if (isDragging) {
            isDragging = false;

            if (brushHistory[args.target].brushed) {
                brushHistory[args.target].steps.push({
                    max_x: args.brushed_max_x || args.max_x,
                    min_x: args.brushed_min_x || args.min_x,
                    max_y: args.brushed_max_y || args.max_y,
                    min_y: args.brushed_min_y || args.min_y
                });
            }

            brushHistory[args.target].brushed = true;

            boundedData = [];
            // is there at least one data point in the chosen selection? if not, increase the range until there is.
            var iterations = 0;
            while (boundedData.length === 0 && iterations <= flatData.length) {
                args.brushed_min_x = interval.round(xScale.invert(extentX0));
                args.brushed_max_x = Math.max(
                    interval.offset(args.min_x, 1),
                    interval.round(xScale.invert(extentX1)));

                boundedData = flatData.filter(function(d) {
                    var val = d[args.x_accessor];
                    return val >= args.brushed_min_x && val <= args.brushed_max_x;
                });

                iterations++;
            }

            xBounds = d3.extent(boundedData, mapDtoX);
            args.brushed_min_x = +xBounds[0];
            args.brushed_max_x = +xBounds[1];
            xScale.domain(xBounds);

            yBounds = d3.extent(boundedData, mapDtoY);
            // add 10% padding on the y axis for better display
            // @TODO: make this an option
            args.brushed_min_y = yBounds[0] * 0.9;
            args.brushed_max_y = yBounds[1] * 1.1;
            yScale.domain(yBounds);
        }
        // if we're using out: use all of the data
        else {
            var previousBrush = brushHistory[args.target].steps.pop();
            if (previousBrush) {
                args.brushed_max_x = previousBrush.max_x;
                args.brushed_min_x = previousBrush.min_x;
                args.brushed_max_y = previousBrush.max_y;
                args.brushed_min_y = previousBrush.min_y;

                xBounds = [args.brushed_min_x, args.brushed_max_x];
                yBounds = [args.brushed_min_y, args.brushed_max_y];
                xScale.domain(xBounds);
                yScale.domain(yBounds);
            } else {
                rollover.classed('mg-brushing', false);
                brushHistory[args.target].brushed = false;

                delete args.brushed_max_x;
                delete args.brushed_min_x;
                delete args.brushed_max_y;
                delete args.brushed_min_y;

                xBounds = [
                    brushHistory[args.target].original.min_x,
                    brushHistory[args.target].original.max_x
                ];

                yBounds = [
                    brushHistory[args.target].original.min_y,
                    brushHistory[args.target].original.max_y
                ];
            }
        }

        if (xBounds[0] < xBounds[1]) {
            // trigger the brushing callback
            if (args.after_brushing) {
                args.after_brushing.apply(this, [{
                    min_x: xBounds[0],
                    max_x: xBounds[1],
                    min_y: yBounds[0],
                    max_y: yBounds[1]
                }]);
            }
        }

        // redraw the chart
        if (!args.brushing_manual_redraw) {
           MG.data_graphic(args);
        }
    });

    return this;
}

MG.add_hook('line.after_init', function(lineChart) {
  brushing.apply(lineChart);
});

function processXAxis(args, min_x, max_x) {
  if (args.brushing) {
    args.processed.min_x = args.brushed_min_x ? Math.max(args.brushed_min_x, min_x) : min_x;
    args.processed.max_x = args.brushed_max_x ? Math.min(args.brushed_max_x, max_x) : max_x;
  }
}

MG.add_hook('x_axis.process_min_max', processXAxis);

function processYAxis(args) {
  if (args.brushing && (args.brushed_min_y || args.brushed_max_y)) {
    args.processed.min_y = args.brushed_min_y;
    args.processed.max_y = args.brushed_max_y;
  }
}

MG.add_hook('y_axis.process_min_max', processYAxis);

function afterRollover(args) {
  if (brushHistory[args.target] && brushHistory[args.target].brushed) {
    var svg = d3.select(args.target).select('svg');
    svg.classed('mg-brushed', true);
  }
}

MG.add_hook('line.after_rollover', afterRollover);

/* helpers */
function get_brush_interval(args) {
    var resolution = args.brushing_interval,
        interval;

    if (!resolution) {
        if (args.time_series) {
            resolution = d3.time.day;
        } else {
            resolution = 1;
        }
    }

    // work with N as integer
    if (typeof resolution === 'number') {
        interval = {
            round: function(val) {
                return resolution * Math.round(val / resolution);
            },
            offset: function(val, count) {
                return val + (resolution * count);
            }
        };
    }
    // work with d3.time.[interval]
    else if (typeof resolution.round === 'function'
             && typeof resolution.offset === 'function' ) {
        interval = resolution;
    }
    else {
        console.warn('The `brushing_interval` provided is invalid. It must be either a number or expose both `round` and `offset` methods');
    }

    return interval;
}

function is_within_bounds(datum, args) {
    var x = +datum[args.x_accessor],
        y = +datum[args.y_accessor];

    return x >= (+args.processed.min_x || x)
        && x <= (+args.processed.max_x || x)
        && y >= (+args.processed.min_y || y)
        && y <= (+args.processed.max_y || y);
}