/**
  Brushing for line charts

  1. hooks
*/

var brushHistory = {},
  args;

MG.add_hook('global.defaults', function(args) {
  // enable brushing unless it's explicitly disabled
  args.brushing = args.brushing !== false;
  if (args.brushing) {
    args.brushing_history = args.brushing_history !== false;
    args.aggregate_rollover = true;
  }
});

function brushing() {
    var chartContext = this;

    args = this.args;

    if (args.brushing === false) {
        return this;
    }

    if (!brushHistory[args.target] || !brushHistory[args.target].brushed) {
        brushHistory[args.target] = {
            brushed: false,
            steps: [],
            original: {
                min_y: +args.processed.min_y,
                max_y: +args.processed.max_y
            }
        };
    }

    var isDragging = false,
        mouseDown = false,
        originY,
        svg = d3.select(args.target).select('svg'),
        body = d3.select('body'),
        rollover = svg.select('.mg-rollover-rect, .mg-voronoi'),
        brushingGroup,
        extentRect;

    rollover.classed('mg-brush-container', true);

    brushingGroup = rollover.insert('g', '*')
        .classed('mg-brush', true);

    extentRect = brushingGroup.append('rect')
        .attr('opacity', 0)
        .attr('x', args.left)
        .attr('width', args.width - args.left - args.right - args.buffer)
        .classed('mg-extent', true);

    // mousedown, start area selection
    svg.on('mousedown', function() {
        mouseDown = true;
        isDragging = false;
        originY = d3.mouse(this)[1];
        svg.classed('mg-brushed', false);
        svg.classed('mg-brushing-in-progress', true);
        extentRect.attr({
            y: d3.mouse(this)[1],
            opacity: 0,
            width: 0
        });
    });

    // mousemove / drag, expand area selection
    svg.on('mousemove', function() {
        if (mouseDown) {
            isDragging = true;
            rollover.classed('mg-brushing', true);

            var mouseY = d3.mouse(this)[1],
                newY = Math.min(originY, mouseY),
                height = Math.max(originY, mouseY) - newY;

            extentRect
              .attr('y', newY)
              .attr('height', height)
              .attr('opacity', 1);
        }
    });

    // mouseup, finish area selection
    svg.on('mouseup', function() {
        mouseDown = false;
        svg.classed('mg-brushing-in-progress', false);

        var yScale = args.scales.Y,
            yBounds,
            extentY0 = +extentRect.attr('y') - args.top,
            extentY1 = extentY0 + (+extentRect.attr('height')),
            chartHeight = args.height - args.top - args.bottom - args.buffer;

        // if we're zooming in: calculate the domain for x and y axes based on the selected rect
        if (isDragging) {
            isDragging = false;

            if (brushHistory[args.target].brushed) {
                brushHistory[args.target].steps.push({
                    max_y: args.brushed_max_y || args.processed.max_y,
                    min_y: args.brushed_min_y || args.processed.min_y
                });
            }

            brushHistory[args.target].brushed = true;

            yBounds = [(1 - extentY1 / chartHeight) * (yScale.domain()[1] - yScale.domain()[0]) + yScale.domain()[0],
                       (1 - extentY0 / chartHeight) * (yScale.domain()[1] - yScale.domain()[0]) + yScale.domain()[0]];
            args.brushed_min_y = yBounds[0];
            args.brushed_max_y = yBounds[1];
            yScale.domain(yBounds);
        }
        // zooming out on click, maintaining the step history
        else if (args.brushing_history) {
            if (brushHistory[args.target].brushed) {
                var previousBrush = brushHistory[args.target].steps.pop();
                if (previousBrush) {
                    args.brushed_max_y = previousBrush.max_y;
                    args.brushed_min_y = previousBrush.min_y;

                    yBounds = [args.brushed_min_y, args.brushed_max_y];
                    yScale.domain(yBounds);
                } else {
                    brushHistory[args.target].brushed = false;

                    delete args.brushed_max_y;
                    delete args.brushed_min_y;

                    yBounds = [
                        brushHistory[args.target].original.min_y,
                        brushHistory[args.target].original.max_y
                    ];
                }
            }
        }

        // has anything changed?
        if (yBounds) {
            if (yBounds[0] < yBounds[1]) {
                // trigger the brushing callback

                var step = {
                    min_y: yBounds[0],
                    max_y: yBounds[1]
                };

                brushHistory[args.target].current = step;

                if (args.after_brushing) {
                    args.after_brushing.apply(this, [step]);
                }
            }

            // redraw the chart
            if (!args.brushing_manual_redraw) {
               MG.data_graphic(args);
            }
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
  if (args.brushing_history && brushHistory[args.target] && brushHistory[args.target].brushed) {
    var svg = d3.select(args.target).select('svg');
    svg.classed('mg-brushed', true);
  }
}

MG.add_hook('line.after_rollover', afterRollover);
