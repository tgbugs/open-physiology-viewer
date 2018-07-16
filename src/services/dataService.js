import { nodes, links, lyphs, groups, materials} from '../data/graph.json';

import { keys, values, cloneDeep, merge, mergeWith} from 'lodash-bound';
import * as colorSchemes from 'd3-scale-chromatic';
import { Graph } from '../models/graphModel';
import { LINK_TYPES } from '../models/linkModel';
import { modelClasses } from '../models/utils';

const colors = [...colorSchemes.schemePaired, ...colorSchemes.schemeDark2];
const colorSchemeOffset = 0.25; //Colors at the beginning and at the end of the color arrays are too dark or too light, so we skip some percentage
const propertyList = ["nodes", "lyphs", "links"];

/**
 * A class that assembles ApiNATOMY model from available data sources:
 * 1. Core graph definition
 * 2. Nervous system
 * 3. Kidney subsystems https://drive.google.com/file/d/0B89UZ62PbWq4ZkJkTjdkN1NBZDg/view
 * 4. Cardiac subsystems
 * 5. Spinatholamic tracts
 * ...
 */
export class DataService{
    _entitiesByID = {};

    /**
     * Prepare core ApiNATOMY graph
     */
    init(){
        /////////////////////////////////////////////////////////////////////
        //Helper functions

        const addColor = (array, defaultColor) => array.filter(obj => !obj.color)
            .forEach((obj, i) => { obj.color = defaultColor || colors[i % colors.length] });

        const colorLyphsExt = (lyphs, colorFn, numColors, reversed = false) => {
            lyphs.forEach((lyphID, i) =>{
                let lyph = this._graphData.lyphs.find(lyph => lyph.id === lyphID);
                lyph.color = colorFn(((reversed)? 1 - colorSchemeOffset - i / numColors : colorSchemeOffset + i / numColors));
            });
        };

        const getLinkByLyphID = (lyphID) => {
            let res = this._graphData.links.find(link => link.conveyingLyph &&
            (link.conveyingLyph  === lyphID || link.conveyingLyph.id === lyphID));
            if (!res) {
                const hasLayer = (lyph, layerID) =>
                    (this._graphData.lyphs.find(e => e.id === lyph).layers||[])
                        .find(layer => layer === layerID);
                //For lyphs which are layers, return parent's link
                res = this._graphData.links.find(link => link.conveyingLyph && hasLayer(link.conveyingLyph, lyphID));
            }
            return res;
        };

        const generateEntitiesFromGroupRefs = groups => {
            groups.forEach(group => {
                //generate node, link and lyph objects that are referred from a group but are not in the main graph
                propertyList.forEach(property => {
                    (group[property]||[]).forEach((id, i) => {
                        let entity = this._graphData[property].find(e => e.id === id);
                        if (entity === undefined){
                            entity = {"id": id};
                            this._graphData[property].push(entity);
                        }
                    })
                });
            });
        };

        const expandGroupSettings = groups => {
            groups.forEach(group => {
                //assign properties
                (group.assign||[])::keys().forEach(property => {
                    if (group.assign[property] && this._graphData[property]) {
                        (group[property]||[]).map(id => this._graphData[property]
                            .find(e => e.id === id)).forEach(e => e::mergeWith(group.assign[property], noOverwrite));
                    }
                });
                //interpolate properties
                (group.interpolate||[])::keys().forEach(property => {
                    if (group.interpolate[property] && this._graphData[property]) {
                        //color scheme is applied to the conveying lyphs of the links in a group
                        if (property === "lyphs") {
                            if (group.interpolate[property].color && colorSchemes[group.interpolate[property].color]) {
                                let links = group.links.map(e => this._graphData.links.find(lnk => lnk.id === e));
                                let lyphs = links.filter(lnk => lnk.conveyingLyph)
                                    .map(lnk => this._graphData.lyphs.find(lyph => lyph.id === lnk.conveyingLyph));
                                lyphs.forEach((e, i) => e.color = colorSchemes[group.interpolate[property].color](colorSchemeOffset + i / lyphs.length));
                            } else {
                                console.warn("Unrecognized color scheme: ", group.interpolate[property].color);
                            }
                        }
                        if (property === "nodes"){
                            if (group.interpolate[property].offset){
                                if ((group.nodes||[]).length > 0){
                                    let nodes = group.nodes.map(e => this._graphData.nodes.find(node => node.id === e));
                                    let spec = group.interpolate[property].offset;
                                    spec::mergeWith({
                                        "start": 0,
                                        "end": 1,
                                        "step": (spec.end - spec.start) / (nodes.length + 1)
                                    }, noOverwrite);
                                    nodes.forEach((node, i) => node.offset = spec.start + spec.step * ( i + 1 ) );
                                }
                            }
                        }
                    }
                })
            });
        };

        const createInternalLyphs = (lyph) => {
            let newGroupIDs = {"nodes": [], "links": [], "lyphs": []};
            lyph.internalLyphs.forEach(innerLyphID => {
                let innerLyph = this._graphData.lyphs.find(lyph => lyph.id === innerLyphID);
                if (innerLyph) {
                    innerLyph::merge({
                        scale: {"height": 100, "width": 50},
                        belongsToLyph: lyph
                    });
                }
                let [sNode, tNode] = ["s", "t"].map(prefix => ({
                    "id"       : `${prefix}${innerLyphID}`,
                    "name"     : `${prefix}${innerLyphID}`,
                    "color"    : "#ccc",
                    "val"      : 0.1,
                    "skipLabel": true
                }));
                [sNode, tNode].forEach(node => {
                    this._graphData.nodes.push(node);
                    newGroupIDs.nodes.push(node.id);
                });

                let axis = getLinkByLyphID(lyph.id);

                let link = {
                    "id"            : `${sNode.id}_ ${tNode.id}`,
                    "source"        : sNode,
                    "target"        : tNode,
                    "length"        : axis? axis.length * 0.8: 5,
                    "type"          : LINK_TYPES.INVISIBLE,
                    "color"         : "#ccc",
                    "conveyingLyph" : innerLyphID
                };
                this._graphData.links.push(link);
                newGroupIDs.lyphs.push(innerLyph.id);
                newGroupIDs.links.push(link.id);
            });
            return newGroupIDs;
        };

        const noOverwrite = (objVal, srcVal) => {
            if (objVal && objVal !== srcVal) { return objVal; }
            return srcVal;
        };

        ///////////////////////////////////////////////////////////////////////
        //Copy entities from subgroups
        groups.filter(parent => parent.groups).forEach(group => {
            propertyList.forEach(property => {
                group[property] = [...group[property]||[], ...[].concat(
                    ...group.groups.map(subgroupID => {
                        let g = groups.find(g => g.id === subgroupID);
                        g.remove = true; //TODO introduce a property to decide whether to show the group on the panel
                        if (g){ return g[property]||[]; } else {
                            console.warn("Reference to unknown group found", subgroupID);
                        } return [];
                    })
                )]
            });
        });

        this._graphData = {
            id: "graph1",
            assign: {
                nodes: {"charge": 10}
            },
            nodes    : [...nodes]    ::cloneDeep(),
            links    : [...links]    ::cloneDeep(),
            lyphs    : [...lyphs]    ::cloneDeep(),
            groups   : [...groups]   ::cloneDeep(),
            materials: [...materials]::cloneDeep()
        };

        //Auto-generate links, nodes and lyphs for ID's in groups if they do not exist in the main graph
        generateEntitiesFromGroupRefs(this._graphData.groups);
        //Assign group properties
        expandGroupSettings([this._graphData]);
        expandGroupSettings(this._graphData.groups);

        //Remove subgroups
        this.graphData.groups = this.graphData.groups.filter(g => !g.remove);
        this.graphData.groups.forEach(g => delete g.groups);

        let groupsByName = {};
        this._graphData.groups.forEach(g => groupsByName[g.name] = g);

        /* Modify central nervous system lyphs appearance */

        //TODO how to generalize? Apply custom function to the group?
        let maxLayers = Math.max(...groupsByName["Neural system"].lyphs.map(lyphID =>
            (this._graphData.lyphs.find(lyph => lyph.id === lyphID).layers || []).length));

        groupsByName["Neural system"].lyphs.forEach(lyphID => {
            let ependymalLyph = this._graphData.lyphs.find(lyph => lyph.id === lyphID);
            colorLyphsExt(ependymalLyph.layers, colorSchemes.interpolateBlues, maxLayers, true);
        });

        //Include relevant entities to the neural system group
        this._graphData.lyphs.filter(lyph => lyph.internalLyphs).forEach(lyph => {
            let newGroupIDs = createInternalLyphs(lyph);
            groupsByName["Neurons"].links = [...groupsByName["Neurons"].links||[], ...newGroupIDs.links];
            groupsByName["Neurons"].nodes = [...groupsByName["Neurons"].nodes||[], ...newGroupIDs.nodes];
        });

        //Coalescing lyphs attract by means of invisible links
        this._graphData.lyphs.filter(lyph => lyph.coalescesWith).forEach(lyph => {
            let lyphs = [lyph.id, ...lyph.coalescesWith];
            let coalescingLinks  = lyphs.map(lyphID => getLinkByLyphID(lyphID));

            coalescingLinks.forEach((link1, i) => {
                coalescingLinks.forEach((link2, j) => {
                    if (i === j) { return; }
                    ["source", "target"].forEach(end => {
                        let link = {
                            "id"    : 'lnk' + (this._graphData.links.length + 1).toString(),
                            "source": link1[end],
                            "target": link2[end],
                            "length": 0.1,
                            "type": LINK_TYPES.FORCE
                        };
                        this._graphData.links.push(link);
                        groupsByName["Coalescences"].links.push(link.id);
                    });
                })
            });
        });

        //Color links and lyphs which do not have assigned colors yet
        addColor(this._graphData.links, "#000");
        addColor(this._graphData.lyphs);

        //TODO create specification for link prototypes to generate axes for given lyphs

        /* Cardiac system */
        //TODO create a cardiac system group

        //Generate 4 omega trees: R - MCP, L - MCP, R - MCS, L - MCS, 6 layers each
        const createLink = (src, trg, reversed = false) => {
            let link = {
                "source"    : src,
                "target"    : trg,
            };
            let existing = this._graphData.links.find(lnk => lnk.id === link.id);
            if (existing){
                existing::merge(link);
            } else {
                this._graphData.links.push(link);
            }
        };

        let NUM_LEVELS = 6;
        let dt = 0.5 / NUM_LEVELS;

        /*Find lyph templates, generate new layers and replicate template properties */

        let templates = this._graphData.lyphs.filter(lyph => lyph.isTemplate);
        templates.forEach(template => {
            (template.subtypes || []).forEach(subtypeRef => {
                let subtype = subtypeRef;
                if (typeof subtype === "string") {
                    subtype = this._graphData.lyphs.find(e => e.id === subtypeRef);
                }
                if (subtype){
                    subtype.layers = [];
                    (template.layers|| []).forEach(layerRef => {
                        let layerParent = layerRef;
                        if (typeof layerRef === "string"){
                            layerParent = this._graphData.lyphs.find(e => e.id === layerRef);
                        }
                        if (!layerParent) {
                            console.warn("Generation error: template layer object not found: ", layerRef);
                            return;
                        }
                        let newID = `${layerParent.id}_${subtype.id}`;
                        let lyphLayer = {
                            "id"        : newID,
                            "name"      : `${layerParent.name} in ${subtype.name}`,
                            "supertype" : layerParent.id,
                            "color"     : layerParent.color
                        };
                        this._graphData.lyphs.push(lyphLayer);
                        //Copy defined properties to newly generated lyphs
                        if (template.assign && template.assign[newID]){
                            lyphLayer::mergeWith(template.assign[newID], noOverwrite);
                            createInternalLyphs(lyphLayer);
                        }

                        subtype.layers.push(newID);
                        if (!layerParent.subtypes){ layerParent.subtypes = []; }
                        layerParent.subtypes.push(newID);
                    });
                }
            })
        });

        /////////////////////////////////////////////////////////////////////////
        /* Generate complete model */

        //Copy existing entities to a map to enable nested model instantiation
        this._entitiesByID[this._graphData.id] = this._graphData;
        this._graphData::values().filter(prop => Array.isArray(prop)).forEach(array => array.forEach(e => {
            if (this._entitiesByID[e.id]) {
                console.error("Entity IDs are not unique: ", this._entitiesByID[e.id], e);
            }
            this._entitiesByID[e.id] = e;
        }));

        //Schema validation

        // graphEvent("event", (e) => {
        //     console.warn(e);
        // });

        let conveyingLyphMap = {};
        this._graphData.links.filter(lnk => lnk.conveyingLyph).forEach(lnk => {
           if (!conveyingLyphMap[lnk.conveyingLyph]){
               conveyingLyphMap[lnk.conveyingLyph] = lnk.conveyingLyph;
           } else {
               console.error("It is not allowed to use the same lyph as conveying lyph for multiple processes (links): ", lnk.conveyingLyph);
           }
        });

        console.log("ApiNATOMY input model: ", this._graphData);

        this._graphData = Graph.fromJSON(this._graphData, modelClasses, this._entitiesByID);

        console.log("ApiNATOMY graph: ", this._graphData);

        /*Map initial positional constraints to match the scaled image*/
        const axisLength = 1000;
        const scaleFactor = axisLength * 0.01;

        this._graphData.nodes.forEach(node => node.layout::keys().forEach(key => {node.layout[key] *= scaleFactor; }));
        this._graphData.links.filter(link => link.length).forEach(link => link.length *= 2 * scaleFactor);
    }

    get graphData(){
        return this._graphData;
    }
}