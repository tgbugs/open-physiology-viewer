import * as three from 'three';
const THREE = window.THREE || three;
import {Entity} from './entityModel';
import {align, extractCoords, getCenterPoint, createMeshWithBorder, d2LayerShape, d2LyphShape} from '../three/utils';
import {Border} from './borderModel';
import {boundToPolygon, boundToRectangle, copyCoords} from './utils';

/**
 * Class that creates visualization objects of lyphs
 */
export class Lyph extends Entity {

    static fromJSON(json, modelClasses = {}, entitiesByID) {
        const res = super.fromJSON(json, modelClasses, entitiesByID);

        //Create lyph's border
        res.border = res.border || {};
        res.border.id = res.border.id || "b_" + res.id; //derive border id from lyph's id
        res.border.borderTypes = res.border.borderTypes || [false, ...this.radialBorderTypes(res.topology), false];
        res.border = Border.fromJSON(res.border);
        return res;
    }

    static radialBorderTypes(topology) {
        switch (topology) {
            case "BAG"  :
                return [true, false];
            case "BAG2" :
                return [false, true];
            case "CYST" :
                return [true, true];
        }
        return [false, false];
    }

    get isVisible() {
        return super.isVisible && (this.layerInLyph ? this.layerInLyph.isVisible : true);
    }

    //lyph's center = the center of its rotational axis
    get center() {
        let res = new THREE.Vector3();
        //Note: Do not use lyph borders to compute center as border translation relies on this method
        if (this.layerInLyph && this.viewObjects["main"]) {
            //Note: it is difficult to compute center of a layer geometrically as we have to translate the host axis
            //in the direction orthogonal to the hosting lyph axis along the plane in which the lyph is placed
            //and it can be placed in any plane passing through the axis!
            res = getCenterPoint(this.viewObjects["main"]);
        } else {
            res = this.axis.center;
        }
        return res;
    }

    get axis() {
        if (this.conveyedBy) {
            return this.conveyedBy;
        }
        if (this.layerInLyph) {
            return this.layerInLyph.axis;
        }
    }

    get polygonOffsetFactor() {
        let res = 0;
        //Lyphs positioned on top of the given lyph should be rendered first
        //This prevents blinking of polygons with equal z coordinates
        ["layerInLyph", "internalLyphInLyph", "hostedByLyph"].forEach((prop, i) => {
            if (this[prop]) {
                res = Math.min(res, this[prop].polygonOffsetFactor - i - 1);
            }
        });
        return res;
    }

    /**
     * Defines size of the conveying lyph based on the length of the link
     * @returns {{height: number, width: number}}
     */
    get size() {
        let res = {height: this.axis.length, width: this.axis.length};
        if (this.scale) {
            res.width  *= this.scale.width / 100;
            res.height *= this.scale.height / 100;
        }
        return res;
    }

    translate(p0) {
        let p = p0.clone();
        let transformedLyph = this.layerInLyph ? this.layerInLyph : this;
        if (this.layerInLyph) {
            p.x += this.offset;
        }
        p.applyQuaternion(transformedLyph.viewObjects["main"].quaternion);
        p.add(transformedLyph.center);

        return p;
    }

    // rotate(theta) {
    //     if (!this.viewObjects["main"]) {
    //         return;
    //     }
    //     let q = new THREE.Quaternion();
    //     q.setFromAxisAngle(direction(this.axis), theta);
    //     this.viewObjects["main"].applyQuaternion(q);
    // }

    /**
     * Create view model for the class instance
     * @param state - layout settings
     */
    createViewObjects(state) {

        //Cannot draw a lyph without axis
        if (!this.axis) { return; }

        //Either use given dimensions or set from axis
        this.width  = this.width  || this.size.width;
        this.height = this.height || this.size.height;

        //Create a lyph object
        if (!this.viewObjects["main"]) {
            let numLayers = (this.layers || [this]).length;

            let params = {
                color: this.color,
                polygonOffsetFactor: this.polygonOffsetFactor
            };

            //The shape of the lyph depends on its position in its parent lyph as layer
            let lyphObj = createMeshWithBorder(
                this.prev
                    ? d2LayerShape(
                        [this.prev.width, this.prev.height, this.height / 4, ...this.prev.border.radialTypes],
                        [this.width, this.height, this.height / 4, ...this.border.radialTypes])
                    : d2LyphShape([this.width, this.height, this.height / 4, ...this.border.radialTypes]),
                params);


            lyphObj.userData = this;
            this.viewObjects['main'] = lyphObj;

            this.border.borderInLyph = this;
            this.border.createViewObjects(state);

            //Layers

            //Define proportion each layer takes
            let resizedLayers = (this.layers || []).filter(layer => layer.layerWidth);
            let layerTotalWidth = 0;
            (resizedLayers || []).forEach(layer => layerTotalWidth += layer.layerWidth);
            let defaultWidth = (resizedLayers.length < numLayers) ?
                (100. - layerTotalWidth) / (numLayers - resizedLayers.length) : 0;

            //Link layers
            for (let i = 1; i < (this.layers || []).length; i++) {
                this.layers[i].prev = this.layers[i - 1];
                this.layers[i].prev.next = this.layers[i];
            }

            //Draw layers
            let offset = 0;
            (this.layers || []).forEach(layer => {
                if (!layer.layerWidth) {
                    layer.layerWidth = defaultWidth;
                }
                layer.width = layer.layerWidth / 100 * this.width;
                layer.height = this.height;
                layer.offset = offset;
                offset += layer.width;
                layer.createViewObjects(state);
                let layerObj = layer.viewObjects["main"];
                layerObj.translateX(layer.offset);
                layerObj.translateZ(1);
                lyphObj.add(layerObj);
            });
        }

        //Do not create labels for layers and nested lyphs
        if (this.layerInLyph || this.internalLyphInLyph) {
            return;
        }

        this.createLabels(state.labels[this.constructor.name], state.fontParams);
    }

    /**
     * Update positions of lyphs in the force-directed graph (and their inner content)
     * @param state - view settings
     */
    updateViewObjects(state) {
        if (!this.axis) { return; }

        if (!this.viewObjects["main"]) {
            this.createViewObjects(state);
        }

        if (!this.layerInLyph) {//update label
            if (!this.internalLyphInLyph) {
                if (!(this.labels[state.labels[this.constructor.name]] && this[state.labels[this.constructor.name]])) {
                    this.createViewObjects(state);
                }
            }
            //update lyph
            this.viewObjects["main"].visible = this.isVisible && state.showLyphs;
            copyCoords(this.viewObjects["main"].position, this.center);
            align(this.axis, this.viewObjects["main"], this.axis.reversed);
        } else {
            this.viewObjects["main"].visible = state.showLayers;
        }

        //update layers
        (this.layers || []).forEach(layer => {
            layer.updateViewObjects(state);
        });

        //update inner content
        let fociCenter = (this.hostedLyphs || this.internalNodes) ? getCenterPoint(this.viewObjects["main"]) : null;

        let internalLinks = (this.internalLyphs || []).filter(lyph => lyph.axis).map(lyph => lyph.axis);
        internalLinks.forEach((link, i) => {
            let p  = extractCoords(this.border.borderLinks[0].source);
            let p1 = extractCoords(this.border.borderLinks[0].target);
            let p2 = extractCoords(this.border.borderLinks[1].target);
            [p, p1, p2].forEach(p => p.z += 1);
            let dX = p1.clone().sub(p);
            let dY = p2.clone().sub(p1);
            let delta = 0.05; //offset from the border
            let offsetY = dY.clone().multiplyScalar(delta + i / (internalLinks.length + 2 * delta));
            //offsetX is used to shift the internal lyph's axis link from the border
            let sOffsetX = dX.clone().multiplyScalar(link.source.offset || 0);
            let tOffsetX = dX.clone().multiplyScalar(link.target.offset || 0);
            //Take into account link's "reversed" property?
            //let v = (link.reversed? p.clone().add(sOffsetX): p1.clone().sub(sOffsetX)).add(offsetY);
            //let v1 = (link.reversed? p1.clone().sub(tOffsetX): p.clone().add(tOffsetX)).add(offsetY);
            copyCoords(link.source, p.clone().add(sOffsetX).add(offsetY));
            copyCoords(link.target, p1.clone().sub(tOffsetX).add(offsetY));
        });

        let hostedLinks = (this.hostedLyphs || []).filter(lyph => lyph.axis).map(lyph => lyph.axis);
        if (hostedLinks) {
            const delta = 5;
            hostedLinks.forEach((link) => {
                //Global force pushes content on top of lyph
                if (Math.abs(this.axis.target.z - this.axis.source.z) <= delta) {
                    //Faster way to get projection for lyphs parallel to x-y plane
                    link.source.z = this.axis.source.z + 1;
                    link.target.z = this.axis.target.z + 1;
                } else {
                    //Project links with hosted lyphs to the container lyph plane
                    let plane = new THREE.Plane();
                    let _start = extractCoords(this.axis.source);
                    let _end = extractCoords(this.axis.target);
                    plane.setFromCoplanarPoints(_start, _end, fociCenter);

                    let _linkStart = extractCoords(link.source);
                    let _linkEnd = extractCoords(link.target);
                    [_linkStart, _linkEnd].forEach(node => {
                        plane.projectPoint(node, node);
                        node.z += 1;
                    });
                    copyCoords(link.source, _linkStart);
                    copyCoords(link.target, _linkEnd);
                }

                if (Math.abs(this.axis.target.y - this.axis.source.y) <= delta) {
                    //The lyph rectangle is almost straight, we can quickly bound the content
                    boundToRectangle(link.source, fociCenter, this.width / 2, this.height / 2);
                    boundToRectangle(link.target, fociCenter, this.width / 2, this.height / 2);
                } else {
                    //Roughly confine the links to avoid extreme link jumping
                    //Regardless of the rotation, the area is bounded to the center +/- hypotenuse / 2
                    const h = Math.sqrt(this.width * this.width + this.height * this.height) / 2;
                    boundToRectangle(link.source, fociCenter, h, h);
                    boundToRectangle(link.target, fociCenter, h, h);

                    //Push the link to the tilted lyph rectangle
                    boundToPolygon(link, this.border.borderLinks);
                }
            });
        }

        (this.internalNodes || []).forEach(node => {
            copyCoords(node.layout, fociCenter);
        });

        //update border
        if (this.isVisible) {
            this.border.updateViewObjects(state);
        }

        //Layers and inner lyphs have no labels
        if (this.layerInLyph || this.internalLyphInLyph) {
            return;
        }

        this.updateLabels(state.labels[this.constructor.name], state.showLabels[this.constructor.name], this.center.clone().addScalar(-5));
    }
}
