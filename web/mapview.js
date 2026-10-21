// The map view: Cytoscape over the points map.js lays out, a skill per point colored by its topic,
// each topic's label at its middle. The layout is the map's: filters fade points, they never move one.
import cytoscape from '/vendor/cytoscape.mjs';
import { topicColor as color } from './map.js';

const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
export const topicColor = (topic) => color(topic, dark()) ?? token('--outline');

const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// The map is spread to this extent, whatever UMAP's units: any map is fitted at about the same zoom,
// so its names are the same size. A map of one skill is fitted no closer than FIT_ZOOM.
const WIDTH = 600;
const FIT_ZOOM = 0.75;

function style() {
  const text = token('--on-surface');
  const surface = token('--surface');
  return [
    {
      selector: 'node[kind = "skill"]',
      style: {
        label: 'data(label)', color: token('--on-surface-variant'), 'font-size': 14, 'font-family': 'Roboto, system-ui, sans-serif',
        'text-valign': 'bottom', 'text-margin-y': 3, 'text-outline-color': surface, 'text-outline-width': 2,
        'background-color': 'data(color)', width: 14, height: 14, 'border-width': 2, 'border-color': surface,
        // The topics name the map; a skill's name shows when hovered, or zoomed in enough to read it.
        'min-zoomed-font-size': 15, 'z-index': 10,
      },
    },
    {
      selector: 'node[kind = "topic"]',
      style: {
        // Under the points, as a map's region names are: a point is never hidden by its topic's name.
        label: 'data(label)', color: text, 'text-opacity': 0.7, 'font-size': 26, 'font-weight': 500, 'font-family': 'Roboto, system-ui, sans-serif',
        'text-valign': 'center', 'text-outline-color': surface, 'text-outline-width': 4, 'text-outline-opacity': 0.7,
        'background-opacity': 0, width: 1, height: 1, events: 'no', 'z-index': 0,
      },
    },
    { selector: 'node:selected', style: { 'border-width': 3, 'border-color': token('--primary') } },
    { selector: '.faded', style: { opacity: 0.15 } },
    { selector: 'node.hover', style: { 'min-zoomed-font-size': 0, 'font-size': 22, 'font-weight': 500, color: text, 'z-index': 30 } },
  ];
}

/** The map's elements: a node per skill at its point, and a label node per topic. */
export function mapElements(map, skills) {
  const names = new Map(skills.map((skill) => [skill.id, skill.name]));
  const xs = map.points.map((point) => point.x);
  const ys = map.points.map((point) => point.y);
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const SCALE = extent > 0 ? WIDTH / extent : 1;
  return [
    ...map.points.map((point) => ({
      data: { id: `skill:${point.id}`, label: names.get(point.id), kind: 'skill', skill: point.id, topic: point.topic, color: topicColor(point.topic) },
      position: { x: point.x * SCALE, y: point.y * SCALE },
    })),
    ...map.topics.map((topic, index) => ({
      data: { id: `topic:${index}`, label: topic.label, kind: 'topic' },
      position: { x: topic.x * SCALE, y: topic.y * SCALE },
    })),
  ];
}

export function createMap(container, { onSelect }) {
  const cy = cytoscape({ container, style: style(), wheelSensitivity: 0.3, minZoom: 0.1, maxZoom: 4, autoungrabify: true });
  let shown;
  const fit = () => {
    cy.fit(undefined, 40);
    if (cy.zoom() > FIT_ZOOM) {
      cy.zoom(FIT_ZOOM);
      cy.center();
    }
  };
  cy.on('tap', 'node[kind = "skill"]', (event) => onSelect(event.target.data('skill')));
  cy.on('mouseover', 'node[kind = "skill"]', (event) => {
    event.target.addClass('hover');
    container.style.cursor = 'pointer';
  });
  cy.on('mouseout', 'node[kind = "skill"]', (event) => {
    event.target.removeClass('hover');
    container.style.cursor = '';
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    cy.style(style());
    cy.nodes('[kind = "skill"]').forEach((node) => node.data('color', topicColor(node.data('topic'))));
  });

  return {
    /** Lays out `map` the first time it is given; afterwards only fades the skills not in `ids`. */
    render(map, skills, ids) {
      if (shown !== map) {
        shown = map;
        cy.elements().remove();
        cy.add(mapElements(map, skills));
        cy.layout({ name: 'preset', fit: false }).run();
        fit();
      }
      cy.nodes('[kind = "skill"]').forEach((node) => node.toggleClass('faded', !ids.has(node.data('skill'))));
    },
    fit,
    resize: () => cy.resize(),
  };
}
