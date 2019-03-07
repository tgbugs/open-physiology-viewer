import {Region, Lyph, Border} from "../model/shapeModel";
import {Node, LINK_GEOMETRY} from "../model/visualResourceModel";
import {merge} from 'lodash-bound';
import {
    align,
    copyCoords,
    createMeshWithBorder,
    d3Layer,
    d3Lyph,
    getCenterOfMass,
    getCenterPoint,
    layerShape,
    lyphShape,
    lyphBorders,
    polygonBorders,
    extractCoords,
    boundToPolygon,
    boundToRectangle,
    THREE
} from "./utils";

Object.defineProperty(Lyph.prototype, "center", {
    get: function() {
        let res = new THREE.Vector3();
        //Note: Do not use lyph borders to compute center as border translation relies on this method
        if (this.axis){
            res = this.axis.center || res;
        }
        if (this.layerIn) {
            if (this.viewObjects["main"]) {
                //Note: it is difficult to compute center of a layer geometrically as we have to translate the host axis
                //in the direction orthogonal to the hosting lyph axis along the plane in which the lyph is placed
                //and it can be placed in any plane passing through the axis!
                res = getCenterPoint(this.viewObjects["main"]);
            } else {
                res = res.translateX(this.offset);
            }
        }
        return res;
    }
});

Object.defineProperty(Lyph.prototype, "points", {
    get: function() {
        return (this._points||[]).map(p => this.translate(p))
    }
});

/**
 * Positions the point on the lyph surface
 * @param p0 - initial point (coordinates)
 * @returns {Vector3} transformed point (coordinates)
 */
Lyph.prototype.translate = function(p0) {
    let transformedLyph = this.layerIn ? this.layerIn : this;
    if (!p0 || !transformedLyph.viewObjects["main"]) { return p0; }
    let p = p0.clone();
    p.applyQuaternion(transformedLyph.viewObjects["main"].quaternion);
    p.add(transformedLyph.center);
    return p;
};

/**
 * Create visual objects for a lyph
 * @param state
 */
Lyph.prototype.createViewObjects = function(state) {
    //Cannot draw a lyph without axis
    if (!this.axis) { return; }

    for (let i = 1; i < (this.layers || []).length; i++) {
        this.layers[i].prev = this.layers[i - 1];
        this.layers[i].prev.next = this.layers[i];
    }

    //Create a lyph object
    if (!this.viewObjects["2d"]) {
        //Either use given dimensions or set from axis
        this.width = this.width || this.size.width;
        this.height = this.height || this.size.height;

        let params = {
            color: this.color,
            polygonOffsetFactor: this.polygonOffsetFactor
        };

        //The shape of the lyph depends on its position in its parent lyph as layer
        let offset = this.offset;
        let prev = this.prev || this.layerIn? (this.layerIn.prev || this): this;

        let radius = this.height / 8;
        let obj = createMeshWithBorder(this.prev
            ? layerShape(
                [this.prev.width, prev.height, radius, ...this.prev.radialTypes],
                [this.width, this.height, radius, ...this.radialTypes])
            : lyphShape([this.width, this.height, radius, ...this.radialTypes]),
            params);
        obj.userData = this;
        this.viewObjects['main'] = this.viewObjects['2d'] = obj;

        if (this.create3d){
            params.opacity = 0.5;
            let obj3d = (offset > 0)
                ? d3Layer(
                    [ offset || 1, prev.height, radius, ...prev.radialTypes],
                    [ offset + this.width, this.height, radius, ...this.radialTypes], params)
                : d3Lyph([this.width, this.height, radius, ...this.radialTypes], params) ;
            obj3d.userData = this;
            this.viewObjects["3d"] = obj3d;
            if (state.showLyphs3d){
                this.viewObjects["main"] = this.viewObjects["3d"];
            }
        }

        this._points = [
            new THREE.Vector3(offset, -this.height / 2, 0),
            new THREE.Vector3(offset, this.height / 2, 0),
            new THREE.Vector3(offset + this.width, this.height / 2, 0),
            new THREE.Vector3(offset + this.width, -this.height / 2, 0),
            new THREE.Vector3(offset, -this.height / 2, 0)
        ];

        //Border uses corner points
        this.border.createViewObjects(state);

        //Layers
        //Define proportion each layer takes
        let numLayers = (this.layers || [this]).length;
        let resizedLayers = (this.layers || []).filter(layer => layer.layerWidth);
        let layerTotalWidth = 0;
        (resizedLayers || []).forEach(layer => layerTotalWidth += layer.layerWidth);
        let defaultWidth = (resizedLayers.length < numLayers) ?
            (100. - layerTotalWidth) / (numLayers - resizedLayers.length) : 0;

        let relOffset = 0;
        (this.layers || []).forEach(layer => {
            layer.create3d = this.create3d;
            layer.layerWidth = layer.layerWidth || defaultWidth;
            layer.width = layer.layerWidth / 100 * this.width;
            layer.height = this.height;
            layer.createViewObjects(state);
            let layerObj = layer.viewObjects["2d"];
            this.viewObjects["2d"].add(layerObj);
            layerObj.translateX(relOffset);
            relOffset += layer.width;

            let layerObj3d = layer.viewObjects["3d"];
            if (layerObj3d) {
                this.viewObjects["3d"].add(layerObj3d);
            }
        });
    }
    //Do not create labels for layers and nested lyphs
    if (this.layerIn || this.internalIn) { return; }
    this.createLabels(state);
};

/**
 * Update visual objects for a lyph
 * @param state
 */
Lyph.prototype.updateViewObjects = function(state) {
    if (!this.axis) { return; }

    let viewObj = this.viewObjects["main"] = this.viewObjects["2d"];
    if (!viewObj) {
        this.createViewObjects(state);
        viewObj = this.viewObjects["main"];
    }

    if (state.showLyphs3d && this.viewObjects["3d"]){
        viewObj = this.viewObjects["main"] = this.viewObjects["3d"];
    }

    if (!this.layerIn) {//update label
        if (!this.internalIn) {
            if (!(this.labels[state.labels[this.constructor.name]] && this[state.labels[this.constructor.name]])) {
                this.createViewObjects(state);
            }
        }
        //update lyph
        viewObj.visible = this.isVisible && state.showLyphs;
        copyCoords(viewObj.position, this.center);

        align(this.axis, viewObj, this.axis.reversed);
        //viewObj.rotate
    } else {
        viewObj.visible = state.showLayers;
    }

    //update layers
    (this.layers || []).forEach(layer => layer.updateViewObjects(state));

    this.border.updateViewObjects(state);

    //Layers and inner lyphs have no labels
    if (this.layerIn || this.internalIn) { return; }

    if (state.showCoalescences){
        (this.inCoalescences||[]).forEach(coalescence => {
            if (this !== coalescence.lyphs[0]) { return; } //update is triggered by the main/fisrt lyph
            for (let i = 1; i < coalescence.lyphs.length; i++) {
                let lyph2 = coalescence.lyphs[i];
                //TODO replace with proper coalescence validation check
                if (this.id === lyph2.id || (this.layers || []).find(l => l.id === lyph2.id)){ return; }
                if (this.avgThickness === lyph2.avgThickness) {
                    //coalescing lyphs at the same scale level
                    let layers = this.layers || [this];
                    let layers2 = lyph2.layers || [lyph2];
                    let overlap = Math.min(layers[layers.length - 1].width, layers2[layers2.length - 1].width);
                    let scale = (this.width + lyph2.width - overlap) / (this.width || 1);
                    let v1 = this.points[3].clone().sub(this.points[0]).multiplyScalar(scale);
                    let v2 = this.points[2].clone().sub(this.points[1]).multiplyScalar(scale);
                    let c1 = extractCoords(this.axis.source).clone().add(v1);
                    let c2 = extractCoords(this.axis.target).clone().add(v2);
                    copyCoords(lyph2.axis.source, c1);
                    copyCoords(lyph2.axis.target, c2);
                    lyph2.updateViewObjects(state);
                }
            }
        });
    }

    this.updateLabels(state, this.center.clone().addScalar(state.labelOffset.Lyph));
};

/**
 * Positions a point on a region surface
 * @param p0 - initial point (coordinates)
 * @returns {Vector3} transformed point (coordinates)
 */
Region.prototype.translate = function (p0) {
    if (!p0 || !this.viewObjects["main"]) { return p0; }
    return p0.clone();
};

/**
 * Create visual objects of a region
 * @param state
 */
Region.prototype.createViewObjects = function(state) {
    this.points = this.points.map(p => new THREE.Vector3(p.x, p.y, 0));
    let shape = new THREE.Shape(this.points.map(p => new THREE.Vector2(p.x, p.y))); //Expects Vector2
    this.center = getCenterOfMass(this.points);

    let obj = createMeshWithBorder(shape, {
        color: this.color,
        polygonOffsetFactor: this.polygonOffsetFactor
    });
    obj.userData = this;
    this.viewObjects['main'] = obj;
    this.border.createViewObjects(state);
    this.createLabels(state);
};

/**
 * Update visual objects of a region
 * @param {Object} state - graph configuration
 */
Region.prototype.updateViewObjects = function(state) {
    this.border.updateViewObjects(state);
    this.updateLabels(state,  this.center.clone().addScalar(state.labelOffset.Region));
};

/**
 * Returns coordinates of the bounding box (min and max points defining a parallelogram containing the border points)
 */
Border.prototype.getBoundingBox = function(){
    let [x, y, z] = ["x","y","z"].map(key => this.host.points.map(p => p[key]));
    let min = {"x": Math.min(...x), "y": Math.min(...y), "z": Math.min(...z)};
    let max = {"x": Math.max(...x), "y": Math.max(...y), "z": Math.max(...z)};
    return [min, max];
};

/**
 * Create visual objects for a shape border
 * @param state
 */
Border.prototype.createViewObjects = function(state){
    //Make sure we always have border objects regardless of data input
    for (let i = 0; i < this.borders.length; i++){
        let [s, t] = ["s", "t"].map(
            prefix => Node.fromJSON({"id": `${prefix}_${this.id}_${i}`}
            ));
        this.borders[i]::merge({
            "source": s,
            "target": t,
            "geometry": LINK_GEOMETRY.INVISIBLE,
            "length": this.host.points[i + 1].distanceTo(this.host.points[i])
        });
        if (this.borders[i].conveyingLyph) {
            this.borders[i].conveyingLyph.conveyedBy = this.borders[i];
            this.borders[i].createViewObjects(state);
            state.graphScene.add(this.borders[i].conveyingLyph.viewObjects["main"]);
        }
    }
    //TODO draw borders as links
    this.viewObjects["shape"] = (this.host instanceof Lyph)
        ? lyphBorders([this.host.width, this.host.height, this.host.width / 2, ...this.host.radialTypes])
        : polygonBorders(this.host.points);
};

/**
 * Update visual objects for a shape border
 * @param state
 */
Border.prototype.updateViewObjects = function(state){

    /**
     * Assigns fixed position on a grid inside border
     * @param link - link to place inside border
     * @param i    - position
     * @param numCols - number of columns
     * @param numRows - number of Rows
     */
    const placeLinkInside = (link, i, numCols, numRows) => {//TODO this will only work well for rectangular shapes
        if (!link.source || !link.target){
            console.warn(`Cannot place a link inside border ${this.id}`, link);
            return;
        }
        let delta = 0.05; //offset from the border
        let p = this.host.points.slice(0,3).map(p => p.clone());
        p.forEach(p => p.z += 1);
        let dX = p[1].clone().sub(p[0]);
        let dY = p[2].clone().sub(p[1]);
        let offsetY = dY.clone().multiplyScalar(delta + Math.floor(i / numCols) / (numRows * (1 + 2 * delta) ) );
        let sOffsetX = dX.clone().multiplyScalar(i % numCols / numCols + link.source.offset || 0);
        let tOffsetX = dX.clone().multiplyScalar(1 - (i % numCols + 1) / numCols + link.target.offset || 0);
        copyCoords(link.source, p[0].clone().add(sOffsetX).add(offsetY));
        copyCoords(link.target, p[1].clone().sub(tOffsetX).add(offsetY));
        link.source.z += 1; //todo replace to polygonOffset?
    };

    /**
     * Assign fixed position on a circle inside border
     * @param node   - node to place inside border
     * @param i      - position
     * @param n      - total number of nodes inside
     * @param center - shape center
     */
    const placeNodeInside = (node, i, n, center) => {//TODO this will only work well for rectangular shapes
        if (!node || !node.class) {
            console.warn(`Cannot place a node inside border ${this.id}`, node);
            return;
        }
        let [min, max] = this.getBoundingBox();
        let dX = max.x - min.x; let dY = max.y - min.y;
        let r  = Math.min(dX, dY) / 4;
        let offset = new THREE.Vector3( r, 0, 0 );
        let axis   = new THREE.Vector3( 0, 0, 1);
        let angle  = 4 * Math.PI * i / n;
        offset.applyAxisAngle( axis, angle );
        let pos = center.clone().add(offset);
        copyCoords(node, pos);
        node.z += 1;
    };

    /**
     * Push existing link inside of the border
     * @param link
     */
    const pushLinkInside = (link) => {
        const delta = 5;
        let points = this.host.points.map(p => p.clone());
        let [min, max] = this.getBoundingBox();
        //Global force pushes content on top of lyph
        if (Math.abs(max.z - min.z) <= delta) {
            //Fast way to get projection for lyphs parallel to x-y plane
            link.source.z = link.target.z = points[0].z + 1;
        } else {
            //Project links with hosted lyphs to the container lyph plane
            let plane = new THREE.Plane();
            plane.setFromCoplanarPoints(...points.slice(0,3));

            ["source", "target"].forEach(key => {
                let node = extractCoords(link[key]);
                plane.projectPoint(node, node);
                node.z += 1;
                copyCoords(link[key], node);
            });
        }
        boundToRectangle(link.source, min, max);
        boundToRectangle(link.target, min, max);
        let [dX, dY] = ["x", "y"].map(key => points.map(p => Math.min(p[key] - min[key], max[key] - p[key])));
        if (Math.max(...[...dX,...dY]) > delta) { //if the shape is not rectangle
            //Push the link to the tilted lyph rectangle
            boundToPolygon(link, this.borders);
        }
    };

    for (let i = 0; i < this.borders.length ; i++){
        copyCoords(this.borders[i].source, this.host.points[ i ]);
        copyCoords(this.borders[i].target, this.host.points[i + 1]);
        this.borders[i].updateViewObjects(state);
        //Position hostedNodes exactly on the link shape
        if (this.borders[i].hostedNodes){
            //position nodes on the lyph border (exact shape)
            const offset = 1 / (this.borders[i].hostedNodes.length + 1);
            this.borders[i].hostedNodes.forEach((node, j) => {
                let p = this.viewObjects["shape"][i].getPoint(node.offset ? node.offset : offset * (j + 1));
                p = new THREE.Vector3(p.x, p.y, 1);
                copyCoords(node, this.host.translate(p));
            })
        }
    }

    //By doing the update here, we also support inner content in the region
    const lyphsToLinks = (lyphs) => (lyphs || []).filter(lyph => lyph.axis).map(lyph => lyph.axis);

    let hostedLinks   = lyphsToLinks(this.host.hostedLyphs);
    let internalLinks = lyphsToLinks(this.host.internalLyphs);

    hostedLinks.forEach((link) => { pushLinkInside(link); });
    let numCols = this.host.internalLyphColumns || 1;
    let numRows = internalLinks.length / numCols;
    internalLinks.forEach((link, i) => placeLinkInside(link, i, numCols, numRows));

    let center = getCenterOfMass(this.host.points);
    (this.host.internalNodes || []).forEach((node, i) => placeNodeInside(node, i, this.host.internalNodes.length, center));
};

Object.defineProperty(Region.prototype, "polygonOffsetFactor", {
    get: function() { return 1; }
});

Object.defineProperty(Lyph.prototype, "polygonOffsetFactor", {
    get: function() {
        return Math.min(
        ...["axis", "layerIn", "internalIn", "hostedBy"].map(prop => this[prop]?
            (this[prop].polygonOffsetFactor || 0) - 1: 0));
    }
});

Object.defineProperty(Border.prototype, "polygonOffsetFactor", {
    get: function() {
        return this.host? this.host.polygonOffsetFactor: 0;
    }
});
