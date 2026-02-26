/* Copyright 2016 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import * as nn from "./nn";
import {HeatMap, reduceMatrix} from "./heatmap";
import {
  State,
  datasets,
  activations,
  getKeyFromValue
} from "./state";
import {Example2D, shuffle} from "./dataset";
import {AppendingLineChart} from "./linechart";
import * as d3 from 'd3';

let mainWidth;

const RECT_SIZE = 30;
const BIAS_SIZE = 5;
const NUM_SAMPLES_CLASSIFY = 500;
const DENSITY = 100;

enum HoverType {
  BIAS, WEIGHT
}

interface InputFeature {
  f: (x: number, y: number) => number;
  label?: string;
}

type TraceStepKind =
    "forward" | "loss" | "backward_activation" | "backward_neuron";

interface TraceStep {
  kind: TraceStepKind;
  index: number;
}

interface TraceSession {
  sampleIndex: number;
  point: Example2D;
  inputIds: string[];
  trace: nn.SingleExampleTrace;
  steps: TraceStep[];
  cursor: number;
  lastStep: TraceStep;
  completed: boolean;
  forwardByNodeId: {[id: string]: nn.TraceForwardNodeStep};
  backwardByNodeId: {[id: string]: nn.TraceBackwardNodeStep};
  linkUpdateById: {[id: string]: nn.TraceLinkUpdateStep};
  statusText: string;
  detailHtml: string;
  startIter: number;
  startLossTrain: number;
  startLossTest: number;
  startBiasByNodeId: {[id: string]: number};
  startLinkById: {[id: string]: {weight: number, isDead: boolean}};
  applied: boolean;
}

interface TraceOverlayDragState {
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
  touchId: number;
}

let INPUTS: {[name: string]: InputFeature} = {
  "x": {f: (x, y) => x, label: "X_1"},
  "y": {f: (x, y) => y, label: "X_2"},
  "xSquared": {f: (x, y) => x * x, label: "X_1^2"},
  "ySquared": {f: (x, y) => y * y,  label: "X_2^2"},
  "xTimesY": {f: (x, y) => x * y, label: "X_1X_2"},
  "sinX": {f: (x, y) => Math.sin(x), label: "sin(X_1)"},
  "sinY": {f: (x, y) => Math.sin(y), label: "sin(X_2)"},
};

let HIDABLE_CONTROLS = [
  ["Show test data", "showTestData"],
  ["Discretize output", "discretize"],
  ["Play button", "playButton"],
  ["Step button", "stepButton"],
  ["Reset button", "resetButton"],
  ["Learning rate", "learningRate"],
  ["Activation", "activation"],
  ["Which dataset", "dataset"],
  ["Ratio train data", "percTrainData"],
  ["Noise level", "noise"],
  ["Batch size", "batchSize"],
  ["# of hidden layers", "numHiddenLayers"],
];

class Player {
  private timerIndex = 0;
  private isPlaying = false;
  private callback: (isPlaying: boolean) => void = null;

  /** Plays/pauses the player. */
  playOrPause() {
    if (this.isPlaying) {
      this.isPlaying = false;
      this.pause();
    } else {
      this.isPlaying = true;
      if (iter === 0) {
        simulationStarted();
      }
      this.play();
    }
  }

  onPlayPause(callback: (isPlaying: boolean) => void) {
    this.callback = callback;
  }

  play() {
    this.pause();
    this.isPlaying = true;
    if (this.callback) {
      this.callback(this.isPlaying);
    }
    this.start(this.timerIndex);
  }

  pause() {
    this.timerIndex++;
    this.isPlaying = false;
    if (this.callback) {
      this.callback(this.isPlaying);
    }
  }

  private start(localTimerIndex: number) {
    d3.timer(() => {
      if (localTimerIndex < this.timerIndex) {
        return true;  // Done.
      }
      oneStep();
      return false;  // Not done.
    }, 0);
  }
}

let state = State.deserializeState();
state.regularization = null;
state.regularizationRate = 0;

// Filter out inputs that are hidden.
state.getHiddenProps().forEach(prop => {
  if (prop in INPUTS) {
    delete INPUTS[prop];
  }
});

let boundary: {[id: string]: number[][]} = {};
let selectedNodeId: string = null;
// Plot the heatmap.
let xDomain: [number, number] = [-6, 6];
let heatMap =
    new HeatMap(300, DENSITY, xDomain, xDomain, d3.select("#heatmap"),
        {showAxes: true});
let linkWidthScale = d3.scale.linear()
  .domain([0, 5])
  .range([1, 10])
  .clamp(true);
let colorScale = d3.scale.linear<string, number>()
                     .domain([-1, 0, 1])
                     .range(["#f59322", "#e8eaeb", "#0877bd"])
                     .clamp(true);
let iter = 0;
let trainData: Example2D[] = [];
let testData: Example2D[] = [];
let network: nn.Node[][] = null;
let lossTrain = 0;
let lossTest = 0;
let player = new Player();
let lineChart = new AppendingLineChart(d3.select("#linechart"),
    ["#777", "black"]);
let traceModeEnabled = false;
let traceSession: TraceSession = null;
let traceOverlayPosition = {left: 2, top: 2};
let traceOverlayDragState: TraceOverlayDragState = null;
let traceOverlayDragInitialized = false;

function makeGUI() {
  d3.select("#reset-button").on("click", () => {
    userHasInteracted();
    if (traceModeEnabled) {
      traceStepBackward();
      return;
    }
    reset();
  });

  d3.select("#play-pause-button").on("click", function () {
    userHasInteracted();
    if (traceModeEnabled) {
      player.pause();
      if (iter === 0) {
        simulationStarted();
      }
      traceStepForward();
      return;
    }
    player.playOrPause();
  });

  player.onPlayPause(isPlaying => {
    d3.select("#play-pause-button").classed("playing", isPlaying);
  });

  d3.select("#next-step-button").on("click", () => {
    player.pause();
    userHasInteracted();
    if (iter === 0) {
      simulationStarted();
    }
    if (traceModeEnabled) {
      traceStepToEnd();
      return;
    }
    oneStep();
  });

  d3.select("#trace-mode-toggle").on("change", function() {
    setTraceMode(this.checked);
  });
  initializeTraceOverlayDragging();

  d3.select("#data-regen-button").on("click", () => {
    generateData();
    parametersChanged = true;
  });

  let dataThumbnails = d3.selectAll("canvas[data-dataset]");
  dataThumbnails.on("click", function() {
    let newDataset = datasets[this.dataset.dataset];
    if (newDataset === state.dataset) {
      return; // No-op.
    }
    state.dataset =  newDataset;
    dataThumbnails.classed("selected", false);
    d3.select(this).classed("selected", true);
    generateData();
    parametersChanged = true;
    reset();
  });

  let datasetKey = getKeyFromValue(datasets, state.dataset);
  // Select the dataset according to the current state.
  d3.select(`canvas[data-dataset=${datasetKey}]`)
    .classed("selected", true);

  d3.select("#add-layers").on("click", () => {
    if (state.numHiddenLayers >= 6) {
      return;
    }
    state.networkShape[state.numHiddenLayers] = 2;
    state.numHiddenLayers++;
    parametersChanged = true;
    reset();
  });

  d3.select("#remove-layers").on("click", () => {
    if (state.numHiddenLayers <= 0) {
      return;
    }
    state.numHiddenLayers--;
    state.networkShape.splice(state.numHiddenLayers);
    parametersChanged = true;
    reset();
  });

  let showTestData = d3.select("#show-test-data").on("change", function() {
    state.showTestData = this.checked;
    state.serialize();
    userHasInteracted();
    heatMap.updateTestPoints(state.showTestData ? testData : []);
  });
  // Check/uncheck the checkbox according to the current state.
  showTestData.property("checked", state.showTestData);

  let discretize = d3.select("#discretize").on("change", function() {
    state.discretize = this.checked;
    state.serialize();
    userHasInteracted();
    updateUI();
  });
  // Check/uncheck the checbox according to the current state.
  discretize.property("checked", state.discretize);

  let percTrain = d3.select("#percTrainData").on("input", function() {
    state.percTrainData = this.value;
    d3.select("label[for='percTrainData'] .value").text(this.value);
    generateData();
    parametersChanged = true;
    reset();
  });
  percTrain.property("value", state.percTrainData);
  d3.select("label[for='percTrainData'] .value").text(state.percTrainData);

  let noise = d3.select("#noise").on("input", function() {
    state.noise = this.value;
    d3.select("label[for='noise'] .value").text(this.value);
    generateData();
    parametersChanged = true;
    reset();
  });
  let currentMax = parseInt(noise.property("max"));
  if (state.noise > currentMax) {
    if (state.noise <= 80) {
      noise.property("max", state.noise);
    } else {
      state.noise = 50;
    }
  } else if (state.noise < 0) {
    state.noise = 0;
  }
  noise.property("value", state.noise);
  d3.select("label[for='noise'] .value").text(state.noise);

  let batchSize = d3.select("#batchSize").on("input", function() {
    state.batchSize = this.value;
    d3.select("label[for='batchSize'] .value").text(this.value);
    parametersChanged = true;
    reset();
  });
  batchSize.property("value", state.batchSize);
  d3.select("label[for='batchSize'] .value").text(state.batchSize);

  let activationDropdown = d3.select("#activations").on("change", function() {
    state.activation = activations[this.value];
    parametersChanged = true;
    reset();
  });
  activationDropdown.property("value",
      getKeyFromValue(activations, state.activation));

  let learningRate = d3.select("#learningRate").on("change", function() {
    state.learningRate = +this.value;
    state.serialize();
    userHasInteracted();
    parametersChanged = true;
  });
  learningRate.property("value", state.learningRate);

  // Add scale to the gradient color map.
  let x = d3.scale.linear().domain([-1, 1]).range([0, 144]);
  let xAxis = d3.svg.axis()
    .scale(x)
    .orient("bottom")
    .tickValues([-1, 0, 1])
    .tickFormat(d3.format("d"));
  d3.select("#colormap g.core").append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0,10)")
    .call(xAxis);

  // Listen for css-responsive changes and redraw the svg network.

  window.addEventListener("resize", () => {
    let newWidth = document.querySelector("#main-part")
        .getBoundingClientRect().width;
    if (newWidth !== mainWidth) {
      mainWidth = newWidth;
      drawNetwork(network);
      updateUI(true);
    }
  });

  d3.select("#trace-mode-toggle").property("checked", false);
  setTraceMode(false);

  // Hide the text below the visualization depending on the URL.
  if (state.hideText) {
    d3.select("#article-text").style("display", "none");
    d3.select("div.more").style("display", "none");
    d3.select("header").style("display", "none");
  }
}

function updateBiasesUI(network: nn.Node[][]) {
  nn.forEachNode(network, true, node => {
    d3.select(`rect#bias-${node.id}`).style("fill", colorScale(node.bias));
  });
}

function updateWeightsUI(network: nn.Node[][], container) {
  for (let layerIdx = 1; layerIdx < network.length; layerIdx++) {
    let currentLayer = network[layerIdx];
    // Update all the nodes in this layer.
    for (let i = 0; i < currentLayer.length; i++) {
      let node = currentLayer[i];
      for (let j = 0; j < node.inputLinks.length; j++) {
        let link = node.inputLinks[j];
        container.select(`#link${link.source.id}-${link.dest.id}`)
            .style({
              "stroke-dashoffset": -iter / 3,
              "stroke-width": linkWidthScale(Math.abs(link.weight)),
              "stroke": colorScale(link.weight)
            })
            .datum(link);
      }
    }
  }
}

function drawNode(cx: number, cy: number, nodeId: string, isInput: boolean,
    container, node?: nn.Node) {
  let x = cx - RECT_SIZE / 2;
  let y = cy - RECT_SIZE / 2;

  let nodeGroup = container.append("g")
    .attr({
      "class": "node",
      "id": `node${nodeId}`,
      "transform": `translate(${x},${y})`
    });

  // Draw the main rectangle.
  nodeGroup.append("rect")
    .attr({
      x: 0,
      y: 0,
      width: RECT_SIZE,
      height: RECT_SIZE,
    });
  let activeOrNotClass = state[nodeId] ? "active" : "inactive";
  if (isInput) {
    let label = INPUTS[nodeId].label != null ?
        INPUTS[nodeId].label : nodeId;
    // Draw the input label.
    let text = nodeGroup.append("text").attr({
      class: "main-label",
      x: -10,
      y: RECT_SIZE / 2, "text-anchor": "end"
    });
    if (/[_^]/.test(label)) {
      let myRe = /(.*?)([_^])(.)/g;
      let myArray;
      let lastIndex;
      while ((myArray = myRe.exec(label)) != null) {
        lastIndex = myRe.lastIndex;
        let prefix = myArray[1];
        let sep = myArray[2];
        let suffix = myArray[3];
        if (prefix) {
          text.append("tspan").text(prefix);
        }
        text.append("tspan")
        .attr("baseline-shift", sep === "_" ? "sub" : "super")
        .style("font-size", "9px")
        .text(suffix);
      }
      if (label.substring(lastIndex)) {
        text.append("tspan").text(label.substring(lastIndex));
      }
    } else {
      text.append("tspan").text(label);
    }
    nodeGroup.classed(activeOrNotClass, true);
  }
  if (!isInput) {
    // Draw the node's bias.
    nodeGroup.append("rect")
      .attr({
        id: `bias-${nodeId}`,
        x: -BIAS_SIZE - 2,
        y: RECT_SIZE - BIAS_SIZE + 3,
        width: BIAS_SIZE,
        height: BIAS_SIZE,
      }).on("mouseenter", function() {
        updateHoverCard(HoverType.BIAS, node, d3.mouse(container.node()));
      }).on("mouseleave", function() {
        updateHoverCard(null);
      });
  }

  nodeGroup.append("text")
    .attr({
      id: `trace-node-info-${nodeId}`,
      class: "trace-node-info",
      x: RECT_SIZE / 2,
      y: RECT_SIZE / 2 + 3
    })
    .text("");

  nodeGroup.append("text")
    .attr({
      id: `trace-node-context-${nodeId}`,
      class: "trace-node-context",
      x: RECT_SIZE / 2,
      y: RECT_SIZE + 12
    })
    .text("");

  // Draw the node's canvas.
  let div = d3.select("#network").insert("div", ":first-child")
    .attr({
      "id": `canvas-${nodeId}`,
      "class": "canvas"
    })
    .style({
      position: "absolute",
      left: `${x + 3}px`,
      top: `${y + 3}px`
    })
    .on("mouseenter", function() {
      selectedNodeId = nodeId;
      div.classed("hovered", true);
      nodeGroup.classed("hovered", true);
      updateDecisionBoundary(network, false);
      heatMap.updateBackground(boundary[nodeId], state.discretize);
    })
    .on("mouseleave", function() {
      selectedNodeId = null;
      div.classed("hovered", false);
      nodeGroup.classed("hovered", false);
      updateDecisionBoundary(network, false);
      heatMap.updateBackground(boundary[nn.getOutputNode(network).id],
          state.discretize);
    });
  if (isInput) {
    div.on("click", function() {
      state[nodeId] = !state[nodeId];
      parametersChanged = true;
      reset();
    });
    div.style("cursor", "pointer");
  }
  if (isInput) {
    div.classed(activeOrNotClass, true);
  }
  let nodeHeatMap = new HeatMap(RECT_SIZE, DENSITY / 10, xDomain,
      xDomain, div, {noSvg: true});
  div.datum({heatmap: nodeHeatMap, id: nodeId});

}

// Draw network
function drawNetwork(network: nn.Node[][]): void {
  let svg = d3.select("#svg");
  // Remove all svg elements.
  svg.select("g.core").remove();
  // Remove all div elements.
  d3.select("#network").selectAll("div.canvas").remove();
  d3.select("#network").selectAll("div.plus-minus-neurons").remove();

  // Get the width of the svg container.
  let padding = 3;
  let co = d3.select(".column.output").node() as HTMLDivElement;
  let cf = d3.select(".column.features").node() as HTMLDivElement;
  let width = co.offsetLeft - cf.offsetLeft;
  svg.attr("width", width);

  // Map of all node coordinates.
  let node2coord: {[id: string]: {cx: number, cy: number}} = {};
  let container = svg.append("g")
    .classed("core", true)
    .attr("transform", `translate(${padding},${padding})`);
  // Draw the network layer by layer.
  let numLayers = network.length;
  let featureWidth = 118;
  let layerScale = d3.scale.ordinal<number, number>()
      .domain(d3.range(1, numLayers - 1))
      .rangePoints([featureWidth, width - RECT_SIZE], 0.7);
  let nodeIndexScale = (nodeIndex: number) => nodeIndex * (RECT_SIZE + 25);


  let calloutThumb = d3.select(".callout.thumbnail").style("display", "none");
  let calloutWeights = d3.select(".callout.weights").style("display", "none");
  let idWithCallout = null;
  let targetIdWithCallout = null;

  // Draw the input layer separately.
  let cx = RECT_SIZE / 2 + 50;
  let nodeIds = Object.keys(INPUTS);
  let maxY = nodeIndexScale(nodeIds.length);
  nodeIds.forEach((nodeId, i) => {
    let cy = nodeIndexScale(i) + RECT_SIZE / 2;
    node2coord[nodeId] = {cx, cy};
    drawNode(cx, cy, nodeId, true, container);
  });

  // Draw the intermediate layers.
  for (let layerIdx = 1; layerIdx < numLayers - 1; layerIdx++) {
    let numNodes = network[layerIdx].length;
    let cx = layerScale(layerIdx) + RECT_SIZE / 2;
    maxY = Math.max(maxY, nodeIndexScale(numNodes));
    addPlusMinusControl(layerScale(layerIdx), layerIdx);
    for (let i = 0; i < numNodes; i++) {
      let node = network[layerIdx][i];
      let cy = nodeIndexScale(i) + RECT_SIZE / 2;
      node2coord[node.id] = {cx, cy};
      drawNode(cx, cy, node.id, false, container, node);

      // Show callout to thumbnails.
      let numNodes = network[layerIdx].length;
      let nextNumNodes = network[layerIdx + 1].length;
      if (idWithCallout == null &&
          i === numNodes - 1 &&
          nextNumNodes <= numNodes) {
        calloutThumb.style({
          display: null,
          top: `${20 + 3 + cy}px`,
          left: `${cx}px`
        });
        idWithCallout = node.id;
      }

      // Draw links.
      for (let j = 0; j < node.inputLinks.length; j++) {
        let link = node.inputLinks[j];
        let path: SVGPathElement = drawLink(link, node2coord, network,
            container, j === 0, j, node.inputLinks.length).node() as any;
        // Show callout to weights.
        let prevLayer = network[layerIdx - 1];
        let lastNodePrevLayer = prevLayer[prevLayer.length - 1];
        if (targetIdWithCallout == null &&
            i === numNodes - 1 &&
            link.source.id === lastNodePrevLayer.id &&
            (link.source.id !== idWithCallout || numLayers <= 5) &&
            link.dest.id !== idWithCallout &&
            prevLayer.length >= numNodes) {
          let midPoint = path.getPointAtLength(path.getTotalLength() * 0.7);
          calloutWeights.style({
            display: null,
            top: `${midPoint.y + 5}px`,
            left: `${midPoint.x + 3}px`
          });
          targetIdWithCallout = link.dest.id;
        }
      }
    }
  }

  // Draw the output node separately.
  cx = width + RECT_SIZE / 2;
  let node = network[numLayers - 1][0];
  let cy = nodeIndexScale(0) + RECT_SIZE / 2;
  node2coord[node.id] = {cx, cy};
  // Draw links.
  for (let i = 0; i < node.inputLinks.length; i++) {
    let link = node.inputLinks[i];
    drawLink(link, node2coord, network, container, i === 0, i,
        node.inputLinks.length);
  }
  // Adjust the height of the svg.
  svg.attr("height", maxY);

  // Adjust the height of the features column.
  let height = Math.max(
    getRelativeHeight(calloutThumb),
    getRelativeHeight(calloutWeights),
    getRelativeHeight(d3.select("#network"))
  );
  d3.select(".column.features").style("height", height + "px");
  renderTraceView();
}

function getRelativeHeight(selection) {
  let node = selection.node() as HTMLAnchorElement;
  return node.offsetHeight + node.offsetTop;
}

function addPlusMinusControl(x: number, layerIdx: number) {
  let div = d3.select("#network").append("div")
    .classed("plus-minus-neurons", true)
    .style("left", `${x - 10}px`);

  let i = layerIdx - 1;
  let firstRow = div.append("div").attr("class", `ui-numNodes${layerIdx}`);
  firstRow.append("button")
      .attr("class", "mdl-button mdl-js-button mdl-button--icon")
      .on("click", () => {
        let numNeurons = state.networkShape[i];
        if (numNeurons >= 8) {
          return;
        }
        state.networkShape[i]++;
        parametersChanged = true;
        reset();
      })
    .append("i")
      .attr("class", "material-icons")
      .text("add");

  firstRow.append("button")
      .attr("class", "mdl-button mdl-js-button mdl-button--icon")
      .on("click", () => {
        let numNeurons = state.networkShape[i];
        if (numNeurons <= 1) {
          return;
        }
        state.networkShape[i]--;
        parametersChanged = true;
        reset();
      })
    .append("i")
      .attr("class", "material-icons")
      .text("remove");

  let suffix = state.networkShape[i] > 1 ? "s" : "";
  div.append("div").text(
    state.networkShape[i] + " neuron" + suffix
  );
}

function updateHoverCard(type: HoverType, nodeOrLink?: nn.Node | nn.Link,
    coordinates?: [number, number]) {
  let hovercard = d3.select("#hovercard");
  if (type == null) {
    hovercard.style("display", "none");
    d3.select("#svg").on("click", null);
    return;
  }
  d3.select("#svg").on("click", () => {
    hovercard.select(".value").style("display", "none");
    let input = hovercard.select("input");
    input.style("display", null);
    input.on("input", function() {
      if (this.value != null && this.value !== "") {
        if (type === HoverType.WEIGHT) {
          (nodeOrLink as nn.Link).weight = +this.value;
        } else {
          (nodeOrLink as nn.Node).bias = +this.value;
        }
        updateUI();
      }
    });
    input.on("keypress", () => {
      if ((d3.event as any).keyCode === 13) {
        updateHoverCard(type, nodeOrLink, coordinates);
      }
    });
    (input.node() as HTMLInputElement).focus();
  });
  let value = (type === HoverType.WEIGHT) ?
    (nodeOrLink as nn.Link).weight :
    (nodeOrLink as nn.Node).bias;
  let name = (type === HoverType.WEIGHT) ? "Weight" : "Bias";
  hovercard.style({
    "left": `${coordinates[0] + 20}px`,
    "top": `${coordinates[1]}px`,
    "display": "block"
  });
  hovercard.select(".type").text(name);
  hovercard.select(".value")
    .style("display", null)
    .text(value.toPrecision(2));
  hovercard.select("input")
    .property("value", value.toPrecision(2))
    .style("display", "none");
}

function drawLink(
    input: nn.Link, node2coord: {[id: string]: {cx: number, cy: number}},
    network: nn.Node[][], container,
    isFirst: boolean, index: number, length: number) {
  let line = container.insert("path", ":first-child");
  let source = node2coord[input.source.id];
  let dest = node2coord[input.dest.id];
  let datum = {
    source: {
      y: source.cx + RECT_SIZE / 2 + 2,
      x: source.cy
    },
    target: {
      y: dest.cx - RECT_SIZE / 2,
      x: dest.cy + ((index - (length - 1) / 2) / length) * 12
    }
  };
  let diagonal = d3.svg.diagonal().projection(d => [d.y, d.x]);
  line.attr({
    "marker-start": "url(#markerArrow)",
    class: "link",
    id: "link" + input.source.id + "-" + input.dest.id,
    d: diagonal(datum, 0)
  });

  // Add an invisible thick link that will be used for
  // showing the weight value on hover.
  container.append("path")
    .attr("d", diagonal(datum, 0))
    .attr("class", "link-hover")
    .on("mouseenter", function() {
      updateHoverCard(HoverType.WEIGHT, input, d3.mouse(this));
    }).on("mouseleave", function() {
      updateHoverCard(null);
    });
  return line;
}

/**
 * Given a neural network, it asks the network for the output (prediction)
 * of every node in the network using inputs sampled on a square grid.
 * It returns a map where each key is the node ID and the value is a square
 * matrix of the outputs of the network for each input in the grid respectively.
 */
function updateDecisionBoundary(network: nn.Node[][], firstTime: boolean) {
  if (firstTime) {
    boundary = {};
    nn.forEachNode(network, true, node => {
      boundary[node.id] = new Array(DENSITY);
    });
    // Go through all predefined inputs.
    for (let nodeId in INPUTS) {
      boundary[nodeId] = new Array(DENSITY);
    }
  }
  let xScale = d3.scale.linear().domain([0, DENSITY - 1]).range(xDomain);
  let yScale = d3.scale.linear().domain([DENSITY - 1, 0]).range(xDomain);

  let i = 0, j = 0;
  for (i = 0; i < DENSITY; i++) {
    if (firstTime) {
      nn.forEachNode(network, true, node => {
        boundary[node.id][i] = new Array(DENSITY);
      });
      // Go through all predefined inputs.
      for (let nodeId in INPUTS) {
        boundary[nodeId][i] = new Array(DENSITY);
      }
    }
    for (j = 0; j < DENSITY; j++) {
      // 1 for points inside the circle, and 0 for points outside the circle.
      let x = xScale(i);
      let y = yScale(j);
      let input = constructInput(x, y);
      nn.forwardProp(network, input);
      nn.forEachNode(network, true, node => {
        boundary[node.id][i][j] = node.output;
      });
      if (firstTime) {
        // Go through all predefined inputs.
        for (let nodeId in INPUTS) {
          boundary[nodeId][i][j] = INPUTS[nodeId].f(x, y);
        }
      }
    }
  }
}

function getLoss(network: nn.Node[][], dataPoints: Example2D[]): number {
  let loss = 0;
  for (let i = 0; i < dataPoints.length; i++) {
    let dataPoint = dataPoints[i];
    let input = constructInput(dataPoint.x, dataPoint.y);
    let output = nn.forwardProp(network, input);
    loss += nn.Errors.SQUARE.error(output, dataPoint.label);
  }
  return loss / dataPoints.length;
}

function updateUI(firstStep = false, addChartPoint = true) {
  // Update the links visually.
  updateWeightsUI(network, d3.select("g.core"));
  // Update the bias values visually.
  updateBiasesUI(network);
  // Get the decision boundary of the network.
  updateDecisionBoundary(network, firstStep);
  let selectedId = selectedNodeId != null ?
      selectedNodeId : nn.getOutputNode(network).id;
  heatMap.updateBackground(boundary[selectedId], state.discretize);

  // Update all decision boundaries.
  d3.select("#network").selectAll("div.canvas")
      .each(function(data: {heatmap: HeatMap, id: string}) {
    data.heatmap.updateBackground(reduceMatrix(boundary[data.id], 10),
        state.discretize);
  });

  function zeroPad(n: number): string {
    let pad = "000000";
    return (pad + n).slice(-pad.length);
  }

  function addCommas(s: string): string {
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function humanReadable(n: number): string {
    return n.toFixed(3);
  }

  // Update loss and iteration number.
  d3.select("#loss-train").text(humanReadable(lossTrain));
  d3.select("#loss-test").text(humanReadable(lossTest));
  d3.select("#iter-number").text(addCommas(zeroPad(iter)));
  if (addChartPoint) {
    lineChart.addDataPoint([lossTrain, lossTest]);
  }
  renderTraceView();
}

function constructInputIds(): string[] {
  let result: string[] = [];
  for (let inputName in INPUTS) {
    if (state[inputName]) {
      result.push(inputName);
    }
  }
  return result;
}

function constructInput(x: number, y: number): number[] {
  let input: number[] = [];
  for (let inputName in INPUTS) {
    if (state[inputName]) {
      input.push(INPUTS[inputName].f(x, y));
    }
  }
  return input;
}

function formatTraceValue(value: number, digits = 4): string {
  return value.toFixed(digits);
}

function formatTraceSigned(value: number, digits = 4): string {
  let absValue = Math.abs(value).toFixed(digits);
  return (value >= 0 ? "+" : "-") + absValue;
}

function clampTraceOverlayPosition(left: number, top: number): {
  left: number, top: number
} {
  let overlayElement = document.getElementById("trace-overlay") as HTMLElement;
  let networkElement = document.getElementById("network") as HTMLElement;
  if (overlayElement == null || networkElement == null) {
    return {left, top};
  }
  let margin = 2;
  let minLeft = margin;
  let minTop = margin;
  let maxLeft = Math.max(
      minLeft, networkElement.clientWidth - overlayElement.offsetWidth - margin);
  let maxTop = Math.max(
      minTop, networkElement.clientHeight - overlayElement.offsetHeight - margin);
  return {
    left: Math.max(minLeft, Math.min(maxLeft, left)),
    top: Math.max(minTop, Math.min(maxTop, top))
  };
}

function applyTraceOverlayPosition() {
  traceOverlayPosition = clampTraceOverlayPosition(
      traceOverlayPosition.left, traceOverlayPosition.top);
  d3.select("#trace-overlay")
      .style("left", `${traceOverlayPosition.left}px`)
      .style("top", `${traceOverlayPosition.top}px`);
}

function startTraceOverlayDrag(pointerId: number, clientX: number,
    clientY: number) {
  traceOverlayDragState = {
    startClientX: clientX,
    startClientY: clientY,
    startLeft: traceOverlayPosition.left,
    startTop: traceOverlayPosition.top,
    touchId: pointerId
  };
  d3.select("#trace-overlay").classed("dragging", true);
}

function moveTraceOverlayDrag(clientX: number, clientY: number) {
  if (traceOverlayDragState == null) {
    return;
  }
  let nextLeft = traceOverlayDragState.startLeft +
      (clientX - traceOverlayDragState.startClientX);
  let nextTop = traceOverlayDragState.startTop +
      (clientY - traceOverlayDragState.startClientY);
  traceOverlayPosition = clampTraceOverlayPosition(nextLeft, nextTop);
  applyTraceOverlayPosition();
}

function finishTraceOverlayDrag() {
  if (traceOverlayDragState == null) {
    return;
  }
  traceOverlayDragState = null;
  d3.select("#trace-overlay").classed("dragging", false);
}

function initializeTraceOverlayDragging() {
  if (traceOverlayDragInitialized) {
    return;
  }
  traceOverlayDragInitialized = true;
  let overlayElement = document.getElementById("trace-overlay") as HTMLElement;
  if (overlayElement == null) {
    return;
  }
  let onMouseMove = (event: MouseEvent) => {
    if (traceOverlayDragState == null) {
      return;
    }
    event.preventDefault();
    moveTraceOverlayDrag(event.clientX, event.clientY);
  };
  let onMouseUp = () => {
    if (traceOverlayDragState == null) {
      return;
    }
    finishTraceOverlayDrag();
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };
  overlayElement.addEventListener("mousedown", (event: MouseEvent) => {
    event.preventDefault();
    startTraceOverlayDrag(-1, event.clientX, event.clientY);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });

  let onTouchMove = (event: TouchEvent) => {
    if (traceOverlayDragState == null) {
      return;
    }
    let targetTouch: Touch = null;
    for (let i = 0; i < event.touches.length; i++) {
      if (event.touches[i].identifier === traceOverlayDragState.touchId) {
        targetTouch = event.touches[i];
        break;
      }
    }
    if (targetTouch == null) {
      return;
    }
    event.preventDefault();
    moveTraceOverlayDrag(targetTouch.clientX, targetTouch.clientY);
  };
  let onTouchEnd = (event: TouchEvent) => {
    if (traceOverlayDragState == null) {
      return;
    }
    let activeTouchEnded = false;
    for (let i = 0; i < event.changedTouches.length; i++) {
      if (event.changedTouches[i].identifier === traceOverlayDragState.touchId) {
        activeTouchEnded = true;
        break;
      }
    }
    if (!activeTouchEnded) {
      return;
    }
    finishTraceOverlayDrag();
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("touchcancel", onTouchEnd);
  };
  overlayElement.addEventListener("touchstart", (event: TouchEvent) => {
    if (event.changedTouches.length === 0) {
      return;
    }
    let touch = event.changedTouches[0];
    event.preventDefault();
    startTraceOverlayDrag(touch.identifier, touch.clientX, touch.clientY);
    window.addEventListener("touchmove", onTouchMove, {passive: false});
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
  }, {passive: false});
  window.addEventListener("resize", () => applyTraceOverlayPosition());
  applyTraceOverlayPosition();
}

function setTraceOverlay(status: string, detailHtml: string) {
  d3.select("#trace-overlay-status").text(status);
  d3.select("#trace-overlay-detail").html(detailHtml || "");
  applyTraceOverlayPosition();
}

function clearTraceHighlights() {
  d3.selectAll("#network .node").classed("trace-active", false);
  d3.selectAll("#network .core .link").classed("trace-active-link", false);
}

function clearTraceNodeText() {
  d3.selectAll("#network .trace-node-info")
    .classed("trace-active-value", false)
    .text("");
  d3.selectAll("#network .trace-node-context")
    .classed("trace-context-visible", false)
    .text("");
  d3.select("#trace-output-groundtruth").text("");
}

function setTraceNodeInfo(nodeId: string, text: string) {
  d3.selectAll("#network .trace-node-info").classed("trace-active-value", false);
  if (nodeId == null) {
    return;
  }
  d3.select(`#trace-node-info-${nodeId}`)
    .classed("trace-active-value", true)
    .text(text);
}

function setTraceNodeContext(nodeId: string, text: string) {
  if (nodeId == null) {
    return;
  }
  d3.select(`#trace-node-context-${nodeId}`)
    .classed("trace-context-visible", true)
    .text(text);
}

function getTraceActivationKey(nodeId: string): string {
  for (let layerIdx = 1; layerIdx < network.length; layerIdx++) {
    for (let i = 0; i < network[layerIdx].length; i++) {
      if (network[layerIdx][i].id !== nodeId) {
        continue;
      }
      if (layerIdx === network.length - 1) {
        return "tanh";
      }
      return getKeyFromValue(activations, state.activation) || "tanh";
    }
  }
  return "linear";
}

function getTraceActivationFormula(nodeId: string, z: number): string {
  let activationKey = getTraceActivationKey(nodeId);
  if (activationKey === "relu") {
    return `a = ReLU(z) = max(0, ${formatTraceValue(z)})`;
  }
  if (activationKey === "sigmoid") {
    let expTerm = Math.exp(-z);
    return `a = sigmoid(z) = 1/(1 + e^(-z)) = ` +
        `1/(1 + ${formatTraceValue(expTerm)})`;
  }
  if (activationKey === "linear") {
    return `a = linear(z) = z = ${formatTraceValue(z)}`;
  }
  return `a = tanh(z) = tanh(${formatTraceValue(z)})`;
}

function getTraceActivationDerivativeFormula(nodeId: string, z: number,
    activationDer: number): string {
  let activationKey = getTraceActivationKey(nodeId);
  if (activationKey === "relu") {
    return `f'(z) = ReLU'(${formatTraceValue(z)}) = ${formatTraceValue(activationDer)}`;
  }
  if (activationKey === "sigmoid") {
    let sig = 1 / (1 + Math.exp(-z));
    return `f'(z) = sigmoid(z)*(1-sigmoid(z)) = ` +
        `${formatTraceValue(sig)}*(1-${formatTraceValue(sig)}) = ` +
        `${formatTraceValue(activationDer)}`;
  }
  if (activationKey === "linear") {
    return `f'(z) = 1`;
  }
  let tanhValue = (Math as any).tanh(z);
  return `f'(z) = 1 - tanh(z)^2 = 1 - ${formatTraceValue(tanhValue)}^2 = ` +
      `${formatTraceValue(activationDer)}`;
}

function formatTraceRow(stepNumber: number, label: string, value: string): string {
  return `<div class="trace-row"><span class="trace-row-label">${stepNumber}) ` +
      `${label}:</span> ${value}</div>`;
}

function renderTraceContext(session: TraceSession) {
  session.inputIds.forEach((id, i) => {
    setTraceNodeContext(id, `${id}=${formatTraceValue(session.trace.inputs[i], 2)}`);
  });
  d3.select("#trace-output-groundtruth")
    .text(`Ground truth = ${formatTraceValue(session.trace.target, 2)}`);
}

function setTraceMode(isEnabled: boolean) {
  traceModeEnabled = isEnabled;
  d3.select("body").classed("trace-mode", traceModeEnabled);
  player.pause();
  d3.select("#play-pause-button").classed("playing", false);
  traceSession = null;
  clearTraceHighlights();
  clearTraceNodeText();
  if (traceModeEnabled) {
    d3.select("#reset-button").attr("title", "Step backward");
    d3.select("#play-pause-button").attr("title", "Step forward");
    d3.select("#next-step-button").attr("title", "Go to end");
  } else {
    d3.select("#reset-button").attr("title", "Reset the network");
    d3.select("#play-pause-button").attr("title", "Run/Pause");
    d3.select("#next-step-button").attr("title", "Step");
  }
  if (!traceModeEnabled) {
    setTraceOverlay("", "");
    return;
  }
  if (trainData.length === 0) {
    setTraceOverlay(
        "Step mode",
        "No training samples are available. Regenerate or adjust data.");
    return;
  }
  setTraceOverlay(
      "Step mode",
      "Play: next step. Rewind: previous step. Go-to-end: finish this sample.");
  renderTraceView();
}

function buildTraceSteps(trace: nn.SingleExampleTrace): TraceStep[] {
  let steps: TraceStep[] = [];
  for (let i = 0; i < trace.forward.length; i++) {
    steps.push({kind: "forward", index: i});
  }
  steps.push({kind: "loss", index: 0});
  for (let i = 0; i < trace.backward.length; i++) {
    steps.push({kind: "backward_activation", index: i});
    steps.push({kind: "backward_neuron", index: i});
  }
  return steps;
}

function createTraceSession(): TraceSession {
  let sampleIndex = iter % trainData.length;
  let point = trainData[sampleIndex];
  let input = constructInput(point.x, point.y);
  let inputIds = constructInputIds();
  let trace = nn.traceSingleExample(
      network, input, point.label, nn.Errors.SQUARE,
      state.learningRate, 0);
  let forwardByNodeId: {[id: string]: nn.TraceForwardNodeStep} = {};
  let backwardByNodeId: {[id: string]: nn.TraceBackwardNodeStep} = {};
  let linkUpdateById: {[id: string]: nn.TraceLinkUpdateStep} = {};
  trace.forward.forEach(step => {
    forwardByNodeId[step.nodeId] = step;
  });
  trace.backward.forEach(step => {
    backwardByNodeId[step.nodeId] = step;
  });
  trace.linkUpdates.forEach(step => {
    linkUpdateById[step.linkId] = step;
  });
  let startBiasByNodeId: {[id: string]: number} = {};
  let startLinkById: {[id: string]: {weight: number, isDead: boolean}} = {};
  for (let layerIdx = 1; layerIdx < network.length; layerIdx++) {
    let currentLayer = network[layerIdx];
    for (let i = 0; i < currentLayer.length; i++) {
      let node = currentLayer[i];
      startBiasByNodeId[node.id] = node.bias;
      for (let j = 0; j < node.inputLinks.length; j++) {
        let link = node.inputLinks[j];
        startLinkById[link.id] = {weight: link.weight, isDead: link.isDead};
      }
    }
  }
  return {
    sampleIndex,
    point,
    inputIds,
    trace,
    steps: buildTraceSteps(trace),
    cursor: -1,
    lastStep: null,
    completed: false,
    forwardByNodeId,
    backwardByNodeId,
    linkUpdateById,
    statusText: "Step mode",
    detailHtml: "Press Play to run the first forward computation.",
    startIter: iter,
    startLossTrain: lossTrain,
    startLossTest: lossTest,
    startBiasByNodeId,
    startLinkById,
    applied: false
  };
}

function getTraceSourceOutput(session: TraceSession, sourceId: string): number {
  let inputIndex = session.inputIds.indexOf(sourceId);
  if (inputIndex !== -1) {
    return session.trace.inputs[inputIndex];
  }
  let sourceForward = session.forwardByNodeId[sourceId];
  return sourceForward == null ? 0 : sourceForward.output;
}

function getTraceNarrative(session: TraceSession, step: TraceStep): {
  status: string, detailHtml: string, nodeId?: string, nodeValue?: string,
  highlightLinkIds: string[]
} {
  if (step.kind === "forward") {
    let nodeStep = session.trace.forward[step.index];
    let inputValues = nodeStep.contributions.map(contribution =>
      `${contribution.sourceId}=${formatTraceValue(contribution.sourceOutput)}`)
      .join(", ");
    let parameterValues = nodeStep.contributions.map(contribution =>
      `w_${contribution.sourceId}=${formatTraceValue(contribution.weight)}`)
      .join(", ");
    let sumTerms = nodeStep.contributions.map(contribution =>
      formatTraceValue(contribution.weightedValue)).join(" + ");
    let activationFormula =
        getTraceActivationFormula(nodeStep.nodeId, nodeStep.totalInput);
    return {
      status: `Forward ${step.index + 1}/${session.trace.forward.length}`,
      detailHtml: `<b>Node ${nodeStep.nodeId}</b>` +
          formatTraceRow(1, "Inputs", inputValues || "none") +
          formatTraceRow(
              2, "Parameters",
              `b=${formatTraceValue(nodeStep.bias)}; ` +
              `${parameterValues || "no incoming weights"}`) +
          formatTraceRow(
              3, "Intermediate",
              `z = b + sum(w*a) = ${formatTraceValue(nodeStep.bias)} + ` +
              `(${sumTerms || "0"}) = ${formatTraceValue(nodeStep.totalInput)}`) +
          formatTraceRow(4, "Activation formula", activationFormula) +
          formatTraceRow(5, "Final value", `a = ${formatTraceValue(nodeStep.output)}`),
      nodeId: nodeStep.nodeId,
      nodeValue: `a=${formatTraceValue(nodeStep.output, 3)}`,
      highlightLinkIds: nodeStep.contributions.map(contribution =>
          `${contribution.sourceId}-${nodeStep.nodeId}`)
    };
  }
  if (step.kind === "loss") {
    let outputNodeId = nn.getOutputNode(network).id;
    return {
      status: "Loss",
      detailHtml: `<b>Output loss</b>` +
          formatTraceRow(
              1, "Inputs",
              `y_hat=${formatTraceValue(session.trace.output)}, ` +
              `y=${formatTraceValue(session.trace.target)}`) +
          formatTraceRow(
              2, "Parameters", "Square loss: E = 0.5*(y_hat - y)^2") +
          formatTraceRow(
              3, "Intermediate",
              `y_hat - y = ${formatTraceValue(session.trace.output)} - ` +
              `${formatTraceValue(session.trace.target)} = ` +
              `${formatTraceValue(session.trace.output - session.trace.target)}`) +
          formatTraceRow(
              4, "Loss formula",
              `E = 0.5*(${formatTraceValue(session.trace.output - session.trace.target)})^2`) +
          formatTraceRow(5, "Final value", `E = ${formatTraceValue(session.trace.loss)}`),
      nodeId: outputNodeId,
      nodeValue: `E=${formatTraceValue(session.trace.loss, 3)}`,
      highlightLinkIds: []
    };
  }
  let nodeStep = session.trace.backward[step.index];
  if (step.kind === "backward_activation") {
    let inputRow = "";
    let outputDerFormula = "";
    if (nodeStep.backpropContributions.length) {
      inputRow = nodeStep.backpropContributions.map(contribution =>
          `${contribution.destId}: delta_next=${formatTraceValue(contribution.destInputDer)}`)
          .join(", ");
      let terms = nodeStep.backpropContributions.map(contribution =>
          `${formatTraceValue(contribution.weight)}*` +
          `${formatTraceValue(contribution.destInputDer)}`);
      outputDerFormula = `dE/da = sum(w*delta_next) = ${terms.join(" + ")} = ` +
          `${formatTraceValue(nodeStep.outputDer)}`;
    } else {
      inputRow = `y_hat=${formatTraceValue(session.trace.output)}, ` +
          `y=${formatTraceValue(session.trace.target)}`;
      outputDerFormula = `dE/da = y_hat - y = ` +
          `${formatTraceValue(session.trace.output)} - ` +
          `${formatTraceValue(session.trace.target)} = ` +
          `${formatTraceValue(nodeStep.outputDer)}`;
    }
    let forwardStep = session.forwardByNodeId[nodeStep.nodeId];
    let nodeTotalInput = forwardStep ? forwardStep.totalInput : 0;
    let nodeOutput = forwardStep ? forwardStep.output : 0;
    let activationDerivativeFormula = getTraceActivationDerivativeFormula(
        nodeStep.nodeId, nodeTotalInput, nodeStep.activationDer);
    return {
      status: `Backward flow ${step.index + 1}/${session.trace.backward.length}`,
      detailHtml: `<b>Node ${nodeStep.nodeId}: loss -> activation</b>` +
          formatTraceRow(1, "Inputs", inputRow) +
          formatTraceRow(
              2, "Parameters",
              `z=${formatTraceValue(nodeTotalInput)}, ` +
              `a=${formatTraceValue(nodeOutput)}`) +
          formatTraceRow(3, "Intermediate", outputDerFormula) +
          formatTraceRow(4, "Activation derivative", activationDerivativeFormula) +
          formatTraceRow(
              5, "Final value",
              `delta = dE/dz = ${formatTraceValue(nodeStep.outputDer)} * ` +
              `${formatTraceValue(nodeStep.activationDer)} = ` +
              `${formatTraceValue(nodeStep.inputDer)}`),
      nodeId: nodeStep.nodeId,
      nodeValue: `d=${formatTraceValue(nodeStep.inputDer, 3)}`,
      highlightLinkIds: nodeStep.backpropContributions.map(contribution =>
          `${nodeStep.nodeId}-${contribution.destId}`)
    };
  }

  let incoming = session.trace.linkUpdates
      .filter(update => update.destId === nodeStep.nodeId);
  let inputRow = incoming.map(update =>
      `${update.sourceId}=${formatTraceValue(getTraceSourceOutput(session, update.sourceId))}`)
      .join(", ");
  let parameterRow = incoming.map(update =>
      `w_${update.sourceId}=${formatTraceValue(update.oldWeight)}`)
      .join(", ");
  let weightGradientLines = incoming.map(update => {
    let sourceOutput = getTraceSourceOutput(session, update.sourceId);
    return `${update.sourceId}: dE/dw = delta*a_src = ` +
        `${formatTraceValue(nodeStep.inputDer)}*${formatTraceValue(sourceOutput)} = ` +
        `${formatTraceValue(update.errorDer)}`;
  });
  let weightUpdateLines = incoming.map(update => {
    return `${update.sourceId}: w_new = w - lr*dE/dw = ` +
        `${formatTraceValue(update.oldWeight)} + ` +
        `${formatTraceSigned(update.totalDelta)} = ${formatTraceValue(update.newWeight)}`;
  });
  let finalWeightRow = incoming.map(update => {
    return `w_${update.sourceId}=${formatTraceValue(update.newWeight)}`;
  });
  let biasDelta = -state.learningRate * nodeStep.inputDer;
  let oldBias = session.startBiasByNodeId[nodeStep.nodeId];
  let focusValue = incoming.length ?
      `dw=${formatTraceSigned(incoming[0].totalDelta, 3)}` :
      `db=${formatTraceSigned(biasDelta, 3)}`;
  return {
    status: `Backward update ${step.index + 1}/${session.trace.backward.length}`,
    detailHtml: `<b>Node ${nodeStep.nodeId}: neuron update</b>` +
        formatTraceRow(1, "Inputs", inputRow || "No incoming links") +
        formatTraceRow(
            2, "Parameters",
            `lr=${formatTraceValue(state.learningRate)}; ` +
            `b=${formatTraceValue(oldBias)}; ` +
            `${parameterRow || "no incoming weights"}`) +
        formatTraceRow(
            3, "Intermediate",
            weightGradientLines.length ? weightGradientLines.join("<br>") :
                "No weight gradients") +
        formatTraceRow(
            4, "Update formula",
            (weightUpdateLines.length ? weightUpdateLines.join("<br>") + "<br>" : "") +
            `b_new = b - lr*delta = ${formatTraceValue(oldBias)} + ` +
            `${formatTraceSigned(biasDelta)} = ${formatTraceValue(oldBias + biasDelta)}`) +
        formatTraceRow(
            5, "Final value",
            `${finalWeightRow.join(", ") || "No weight updates"}; ` +
            `b=${formatTraceValue(oldBias + biasDelta)}`),
    nodeId: nodeStep.nodeId,
    nodeValue: focusValue,
    highlightLinkIds: incoming.map(update => `${update.sourceId}-${update.destId}`)
  };
}

function restoreTraceSessionStart(session: TraceSession) {
  for (let layerIdx = 1; layerIdx < network.length; layerIdx++) {
    let currentLayer = network[layerIdx];
    for (let i = 0; i < currentLayer.length; i++) {
      let node = currentLayer[i];
      node.bias = session.startBiasByNodeId[node.id];
      for (let j = 0; j < node.inputLinks.length; j++) {
        let link = node.inputLinks[j];
        let start = session.startLinkById[link.id];
        link.weight = start.weight;
        link.isDead = start.isDead;
      }
    }
  }
}

function applyTraceSessionUpdate(session: TraceSession) {
  if (session.applied) {
    return;
  }
  nn.clearDerivatives(network);
  nn.applySingleExampleTrace(network, session.trace);
  nn.clearDerivatives(network);
  iter = session.startIter + 1;
  lossTrain = getLoss(network, trainData);
  lossTest = getLoss(network, testData);
  session.applied = true;
  session.completed = true;
  let sampleInput = constructInput(session.point.x, session.point.y);
  let updatedOutput = nn.forwardProp(network, sampleInput);
  let updatedLoss = nn.Errors.SQUARE.error(updatedOutput, session.point.label);
  session.statusText = "Trace complete";
  session.detailHtml = `Applied parameter updates for this sample.<br>` +
      `Loss moved ${formatTraceValue(session.trace.loss)} -> ` +
      `${formatTraceValue(updatedLoss)}.`;
  updateUI(false, false);
}

function undoTraceSessionUpdate(session: TraceSession) {
  if (!session.applied) {
    return;
  }
  restoreTraceSessionStart(session);
  nn.clearDerivatives(network);
  iter = session.startIter;
  lossTrain = session.startLossTrain;
  lossTest = session.startLossTest;
  session.applied = false;
  session.completed = false;
  updateUI(false, false);
}

function moveTraceCursor(session: TraceSession, targetCursor: number) {
  targetCursor = Math.max(-1, Math.min(targetCursor, session.steps.length));
  if (targetCursor === session.cursor) {
    renderTraceView();
    return;
  }
  session.cursor = targetCursor;
  if (targetCursor === session.steps.length) {
    applyTraceSessionUpdate(session);
    return;
  }
  if (session.applied && targetCursor < session.steps.length) {
    undoTraceSessionUpdate(session);
  }
  session.completed = false;
  if (targetCursor < 0) {
    session.lastStep = null;
    session.statusText = "Step mode";
    session.detailHtml = "Press Play for the first trace step.";
  } else {
    session.lastStep = session.steps[targetCursor];
    let narrative = getTraceNarrative(session, session.lastStep);
    session.statusText = narrative.status;
    session.detailHtml = narrative.detailHtml;
  }
  renderTraceView();
}

function traceStepForward() {
  if (!traceModeEnabled) {
    return;
  }
  if (network == null || trainData.length === 0) {
    setTraceOverlay(
        "Step mode",
        "No training samples are available. Regenerate or adjust data.");
    return;
  }
  if (traceSession == null ||
      (traceSession.applied && traceSession.cursor === traceSession.steps.length)) {
    traceSession = createTraceSession();
  }
  moveTraceCursor(traceSession, traceSession.cursor + 1);
}

function traceStepBackward() {
  if (!traceModeEnabled || traceSession == null) {
    return;
  }
  moveTraceCursor(traceSession, traceSession.cursor - 1);
}

function traceStepToEnd() {
  if (!traceModeEnabled) {
    return;
  }
  if (network == null || trainData.length === 0) {
    setTraceOverlay(
        "Step mode",
        "No training samples are available. Regenerate or adjust data.");
    return;
  }
  if (traceSession == null ||
      (traceSession.applied && traceSession.cursor === traceSession.steps.length)) {
    traceSession = createTraceSession();
  }
  moveTraceCursor(traceSession, traceSession.steps.length);
}

function renderTraceView() {
  if (!traceModeEnabled) {
    return;
  }
  clearTraceHighlights();
  clearTraceNodeText();
  if (network == null) {
    setTraceOverlay("Step mode", "Network is not ready.");
    return;
  }
  if (traceSession == null) {
    setTraceOverlay(
        "Step mode",
        "Play: next step. Rewind: previous step. Go-to-end: finish this sample.");
    return;
  }

  renderTraceContext(traceSession);
  if (traceSession.cursor >= 0 &&
      traceSession.cursor < traceSession.steps.length) {
    let step = traceSession.steps[traceSession.cursor];
    let narrative = getTraceNarrative(traceSession, step);
    setTraceNodeInfo(narrative.nodeId, narrative.nodeValue || "");
    if (narrative.nodeId != null) {
      d3.select(`#node${narrative.nodeId}`).classed("trace-active", true);
    }
    narrative.highlightLinkIds.forEach(id => {
      d3.select(`#link${id}`).classed("trace-active-link", true);
    });
    setTraceOverlay(narrative.status, narrative.detailHtml);
    return;
  }
  setTraceOverlay(traceSession.statusText, traceSession.detailHtml);
}


function oneStep(): void {
  if (traceModeEnabled) {
    traceStepForward();
    return;
  }
  traceSession = null;
  iter++;
  trainData.forEach((point, i) => {
    let input = constructInput(point.x, point.y);
    nn.forwardProp(network, input);
    nn.backProp(network, point.label, nn.Errors.SQUARE);
    if ((i + 1) % state.batchSize === 0) {
      nn.updateWeights(network, state.learningRate, 0);
    }
  });
  // Compute the loss.
  lossTrain = getLoss(network, trainData);
  lossTest = getLoss(network, testData);
  updateUI();
}

export function getOutputWeights(network: nn.Node[][]): number[] {
  let weights: number[] = [];
  for (let layerIdx = 0; layerIdx < network.length - 1; layerIdx++) {
    let currentLayer = network[layerIdx];
    for (let i = 0; i < currentLayer.length; i++) {
      let node = currentLayer[i];
      for (let j = 0; j < node.outputs.length; j++) {
        let output = node.outputs[j];
        weights.push(output.weight);
      }
    }
  }
  return weights;
}

function reset(onStartup=false) {
  lineChart.reset();
  state.serialize();
  if (!onStartup) {
    userHasInteracted();
  }
  player.pause();
  traceSession = null;

  let suffix = state.numHiddenLayers !== 1 ? "s" : "";
  d3.select("#layers-label").text("Hidden layer" + suffix);
  d3.select("#num-layers").text(state.numHiddenLayers);

  // Make a simple network.
  iter = 0;
  let numInputs = constructInput(0 , 0).length;
  let shape = [numInputs].concat(state.networkShape).concat([1]);
  let outputActivation = nn.Activations.TANH;
  network = nn.buildNetwork(shape, state.activation, outputActivation,
      null, constructInputIds(), state.initZero);
  lossTrain = getLoss(network, trainData);
  lossTest = getLoss(network, testData);
  drawNetwork(network);
  updateUI(true);
  if (traceModeEnabled) {
    setTraceOverlay(
        "Step mode",
        "Play: next step. Rewind: previous step. Go-to-end: finish this sample.");
  }
};

function initTutorial() {
  if (state.tutorial == null || state.tutorial === '' || state.hideText) {
    return;
  }
  // Remove all other text.
  d3.selectAll("article div.l--body").remove();
  let tutorial = d3.select("article").append("div")
    .attr("class", "l--body");
  // Insert tutorial text.
  d3.html(`tutorials/${state.tutorial}.html`, (err, htmlFragment) => {
    if (err) {
      throw err;
    }
    tutorial.node().appendChild(htmlFragment);
    // If the tutorial has a <title> tag, set the page title to that.
    let title = tutorial.select("title");
    if (title.size()) {
      d3.select("header h1").style({
        "margin-top": "20px",
        "margin-bottom": "20px",
      })
      .text(title.text());
      document.title = title.text();
    }
  });
}

function drawDatasetThumbnails() {
  function renderThumbnail(canvas, dataGenerator) {
    let w = 100;
    let h = 100;
    canvas.setAttribute("width", w);
    canvas.setAttribute("height", h);
    let context = canvas.getContext("2d");
    let data = dataGenerator(200, 0);
    data.forEach(function(d) {
      context.fillStyle = colorScale(d.label);
      context.fillRect(w * (d.x + 6) / 12, h * (d.y + 6) / 12, 4, 4);
    });
    d3.select(canvas.parentNode).style("display", null);
  }
  d3.selectAll(".dataset").style("display", "none");
  for (let dataset in datasets) {
    let canvas: any =
        document.querySelector(`canvas[data-dataset=${dataset}]`);
    let dataGenerator = datasets[dataset];
    renderThumbnail(canvas, dataGenerator);
  }
}

function hideControls() {
  // Set display:none to all the UI elements that are hidden.
  let hiddenProps = state.getHiddenProps();
  hiddenProps.forEach(prop => {
    let controls = d3.selectAll(`.ui-${prop}`);
    if (controls.size() === 0) {
      console.warn(`0 html elements found with class .ui-${prop}`);
    }
    controls.style("display", "none");
  });

  // Also add checkbox for each hidable control in the "use it in classrom"
  // section.
  let hideControls = d3.select(".hide-controls");
  HIDABLE_CONTROLS.forEach(([text, id]) => {
    let label = hideControls.append("label")
      .attr("class", "mdl-checkbox mdl-js-checkbox mdl-js-ripple-effect");
    let input = label.append("input")
      .attr({
        type: "checkbox",
        class: "mdl-checkbox__input",
      });
    if (hiddenProps.indexOf(id) === -1) {
      input.attr("checked", "true");
    }
    input.on("change", function() {
      state.setHideProperty(id, !this.checked);
      state.serialize();
      userHasInteracted();
      d3.select(".hide-controls-link")
        .attr("href", window.location.href);
    });
    label.append("span")
      .attr("class", "mdl-checkbox__label label")
      .text(text);
  });
  d3.select(".hide-controls-link")
    .attr("href", window.location.href);
}

function generateData(firstTime = false) {
  if (!firstTime) {
    // Change the seed.
    state.seed = Math.random().toFixed(5);
    state.serialize();
    userHasInteracted();
  }
  Math.seedrandom(state.seed);
  let numSamples = NUM_SAMPLES_CLASSIFY;
  let generator = state.dataset;
  let data = generator(numSamples, state.noise / 100);
  // Shuffle the data in-place.
  shuffle(data);
  // Split into train and test data.
  let splitIndex = Math.floor(data.length * state.percTrainData / 100);
  trainData = data.slice(0, splitIndex);
  testData = data.slice(splitIndex);
  heatMap.updatePoints(trainData);
  heatMap.updateTestPoints(state.showTestData ? testData : []);
}

let firstInteraction = true;
let parametersChanged = false;

function userHasInteracted() {
  if (!firstInteraction) {
    return;
  }
  firstInteraction = false;
  let page = 'index';
  if (state.tutorial != null && state.tutorial !== '') {
    page = `/v/tutorials/${state.tutorial}`;
  }
  ga('set', 'page', page);
  ga('send', 'pageview', {'sessionControl': 'start'});
}

function simulationStarted() {
  ga('send', {
    hitType: 'event',
    eventCategory: 'Starting Simulation',
    eventAction: parametersChanged ? 'changed' : 'unchanged',
    eventLabel: state.tutorial == null ? '' : state.tutorial
  });
  parametersChanged = false;
}

drawDatasetThumbnails();
initTutorial();
makeGUI();
generateData(true);
reset(true);
hideControls();
