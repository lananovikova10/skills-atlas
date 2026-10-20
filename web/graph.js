// The graph view: Cytoscape over the elements atlas.js builds. Clicking a skill opens it.
import cytoscape from '/vendor/cytoscape.mjs';
import { graphElements } from './atlas.js';

const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function style() {
  const text = token('--on-surface');
  const muted = token('--on-surface-variant');
  const surface = token('--surface');
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)', color: text, 'font-size': 11, 'font-family': 'Roboto, system-ui, sans-serif',
        'text-valign': 'bottom', 'text-margin-y': 4, 'text-outline-color': surface, 'text-outline-width': 2,
        'background-color': 'data(color)', width: 18, height: 18,
      },
    },
    { selector: 'node[kind = "repository"]', style: { 'background-color': token('--primary'), width: 44, height: 44, 'font-size': 14, 'font-weight': 500 } },
    { selector: 'node[kind = "agent"]', style: { width: 32, height: 32, 'font-size': 13, 'font-weight': 500, shape: 'round-rectangle' } },
    { selector: 'node[kind = "skill"]', style: { 'border-width': 2, 'border-color': surface } },
    { selector: 'node[kind = "tool"]', style: { shape: 'diamond', 'background-color': token('--outline'), width: 14, height: 14, color: muted, 'font-size': 10 } },
    { selector: 'node[kind = "property"]', style: { shape: 'tag', 'background-color': token('--outline-variant'), width: 14, height: 14, color: muted, 'font-size': 10 } },
    { selector: 'edge', style: { width: 1.5, 'line-color': token('--outline-variant'), 'curve-style': 'haystack' } },
    { selector: 'edge[kind = "agent"]', style: { width: 3 } },
    { selector: 'edge[kind = "tool"], edge[kind = "property"]', style: { 'line-style': 'dashed', width: 1 } },
    { selector: 'node:selected', style: { 'border-width': 3, 'border-color': token('--primary') } },
    { selector: '.faded', style: { opacity: 0.15 } },
  ];
}

export function createGraph(container, { onSelect }) {
  const cy = cytoscape({ container, style: style(), wheelSensitivity: 0.3, minZoom: 0.1, maxZoom: 4 });
  cy.on('tap', 'node[kind = "skill"]', (event) => onSelect(event.target.data('skill')));
  // Hovering a node brings out its neighbourhood.
  cy.on('mouseover', 'node', (event) => {
    const near = event.target.closedNeighborhood();
    cy.elements().not(near).addClass('faded');
  });
  cy.on('mouseout', 'node', () => cy.elements().removeClass('faded'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => cy.style(style()));

  return {
    render(repository, skills, options) {
      cy.elements().remove();
      cy.add(graphElements(repository, skills, options));
      cy.layout({ name: 'cose', animate: false, nodeRepulsion: () => 9000, idealEdgeLength: () => 70, padding: 30, randomize: true }).run();
      cy.fit(undefined, 30);
    },
    fit: () => cy.fit(undefined, 30),
    resize: () => cy.resize(),
  };
}
