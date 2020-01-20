import {Link, VisualResource} from './visualResourceModel';
import {clone, merge, pick, isPlainObject} from 'lodash-bound';
import {logger} from './logger';
import {$Field, getGenID, findResourceByID, getNewID, LYPH_TOPOLOGY} from './utils';

/**
 * Class that specifies borders of lyphs and regions
 * @class
 * @property border
 * @property internalLyphs
 * @property internalNodes
 * @property internalLyphColumns
 * @property points
 * @property hostedLyphs
 */
export class Shape extends VisualResource {

    /**
     * Create a Shape resource from its JSON specification together with resources to model shape borders.
     * @param   {Object} json                          - resource definition
     * @param   {Object} [modelClasses]                - map of class names vs implementation of ApiNATOMY resources
     * @param   {Map<string, Resource>} [entitiesByID] - map of resources in the global model
     * @returns {Shape} - ApiNATOMY Shape resource
     */
    static fromJSON(json, modelClasses = {}, entitiesByID) {
        json.id     = json.id || getNewID(entitiesByID);
        json.border = json.border || {};
        json.border.id = json.border.id || (json.id + "_border");
        json.border.borders = json.border.borders || [];
        for (let i = 0; i < json.numBorders ; i++){
            let id = getGenID(json.border.id, i);
            json.border.borders[i]::merge({
                [$Field.id]       : id,
                [$Field.source]   : { id: getGenID("s", id) },
                [$Field.target]   : { id: getGenID("t", id) },
                [$Field.geometry] : Link.LINK_GEOMETRY.INVISIBLE,
                [$Field.generated]: true
            });
        }
        delete json.numBorders;
        let res = super.fromJSON(json, modelClasses, entitiesByID);
        res.border.host = res;
        return res;
    }

    // toggleBorder(){
    //     if (!this.viewObjects || !this.viewObjects['main']) { return; }
    //     if (this.viewObjects['border']){
    //         if (this.viewObjects['main'].children.find(this.viewObjects['border'])){
    //             this.viewObjects['main'].children.remove(this.viewObjects['border']);
    //         } else {
    //             this.viewObjects['main'].add(this.viewObjects['border']);
    //         }
    //     }
    // }
}

/**
 * Class that models lyphs
 * @class
 * @property topology
 * @property angle
 * @property scale
 * @property isTemplate
 * @property conveys
 * @property layers
 * @property layerIn
 * @property internalIn
 * @property inMaterials
 * @property inCoalescences
 * @property bundles
 * @property bundlesTrees
 * @property prev
 * @property next
 * @property villus
 */
export class Lyph extends Shape {
    static LYPH_TOPOLOGY = LYPH_TOPOLOGY;

    static fromJSON(json, modelClasses = {}, entitiesByID) {
        json.numBorders = 4;
        return super.fromJSON(json, modelClasses, entitiesByID);
    }

    /**
     * Generate new layers for subtypes and replicate template properties
     * @param lyphs - lyph set that contains target subtypes
     * @param template - lyph template
     */
    static expandTemplate(lyphs, template){
        if (!template || template._inactive || !lyphs) { return; }

        //Validate subtype
        (template.subtypes||[]).forEach(s => {
            if (s::isPlainObject() && s.id && !lyphs.find(e => e.id === s.id)){
                lyphs.push(s); //generate a lyph for the template supertype
            }
        });
        //Template supertype must contain id's for correct generation
        template.subtypes = (template.subtypes||[]).map(e => e::isPlainObject()? e.id: e);
        let subtypes = lyphs.filter(e => e.supertype === template.id || template.subtypes.includes(e.id));
        subtypes.forEach(subtype => this.clone(lyphs, template, subtype));

        template._inactive = true;
    }

    /**
     * Copy the properties and layer structure of the source lyph to the target lyph
     * @param lyphs      - a set of existing model/group lyphs
     * @param sourceLyph - the lyph to clone
     * @param targetLyph - the cloned lyph instance
     * @returns {Lyph} the target lyph
     */
    static clone(lyphs, sourceLyph, targetLyph){
        if (!sourceLyph || !targetLyph) { return; }
        if (!lyphs) {lyphs = [];}

        if (sourceLyph.supertype && (sourceLyph.layers||[]).length === 0){
            //expand the supertype - the sourceLyph may need to get its layers from the supertype first
            let supertype = findResourceByID(lyphs, sourceLyph.supertype);
            if (supertype && supertype.isTemplate){
                this.expandTemplate(lyphs, supertype);
            }
        }

        targetLyph::merge(sourceLyph::pick([$Field.color, $Field.scale, $Field.height, $Field.width, $Field.length,
            $Field.thickness, $Field.external, $Field.description, $Field.materials, $Field.create3d, $Field.channels, $Field.bundlesTrees]));

        if (sourceLyph.isTemplate){
            targetLyph.supertype = sourceLyph.id;
            //Clone template villus object into all subtype lyphs
            //TODO test
            if (sourceLyph.villus){
                targetLyph.villus = sourceLyph.villus::clone();
                if (targetLyph.villus.id){
                    targetLyph.villus.id = targetLyph.id + "_" + targetLyph.villus.id
                }
                if (targetLyph.villus.villusOf){
                    targetLyph.villus.villusOf = targetLyph.id || targetLyph;
                }
            }
        } else {
            targetLyph.cloneOf = sourceLyph.id;
        }

        if (!targetLyph.name) {
            targetLyph.name = sourceLyph.name + (sourceLyph.name && sourceLyph.name.endsWith("clone)")? "": " (clone)");
        }

        if ((targetLyph.layers||[]).length > 0) {
            logger.warn("Subtype lyph already has layers and will not inherit them from the supertype template", targetLyph);
            return;
        }

        (sourceLyph.layers || []).forEach(layerRef => {
            let sourceLayer = findResourceByID(lyphs, layerRef);
            if (!sourceLayer) {
                logger.warn("Generation error: template layer object not found: ", layerRef);
                return;
            }
            let targetLayer = {
                [$Field.id]        : getGenID(sourceLayer.id, targetLyph.id),
                [$Field.name]      : `${sourceLayer.name || '?'} in ${targetLyph.name || '?'}`,
                [$Field.generated] : true
            };
            lyphs.push(targetLayer);
            this.clone(lyphs, sourceLayer, targetLayer);

            targetLayer::merge(targetLyph::pick([$Field.topology]));
            targetLyph.layers = targetLyph.layers || [];
            targetLyph.layers.push(targetLayer.id);
        });

        return targetLyph;
    }

    /**
     * Get border types based on the lyph's topology
     * @returns {Array}
     */
    get radialTypes() {
        switch (this.topology) {
            case Lyph.LYPH_TOPOLOGY["BAG-"]:
            case Lyph.LYPH_TOPOLOGY.BAG  :
                return [true, false];
            case Lyph.LYPH_TOPOLOGY["BAG+"]:
            case Lyph.LYPH_TOPOLOGY.BAG2 :
                return [false, true];
            case Lyph.LYPH_TOPOLOGY.CYST :
                return [true, true];
            case Lyph.LYPH_TOPOLOGY.TUBE :
                return [false, false];
        }
        if (this.layerIn){
            return this.layerIn.radialTypes;
        }
        return [false, false];
    }

    /**
     * Get lyph visibility
     * @returns {boolean}
     */
    get isVisible() {
        return super.isVisible && (!this.layerIn || this.layerIn.isVisible);
    }

    /**
     * Get lyph axis
     * @returns {Link}
     */
    get axis() {
        return this.conveys || ((this.layerIn)? this.layerIn.axis : null);
    }

    get container(){
        return this.internalIn || this.layerIn && this.layerIn.internalIn;
    }

    get allContainers(){
        let res = [this];
        if (this.layerIn) {
            res = res.concat(this.layerIn.allContainers);
        }
        if (this.internalIn){
            res = res.concat(this.internalIn.allContainers);
        }
        (this.inMaterials||[]).forEach(materialIn => {
            res = res.concat(materialIn.allContainers);
        });
        
        return res;
    }

    /**
     * Defines size of the conveying lyph based on the length of the link
     * @returns {{height: number, width: number}}
     */
    get size() {
        let res = {height: this.axis.length || 1, width: this.axis.length || 1};
        if (this.scale) {
            res.width  *= this.scale.width / 100;
            res.height *= this.scale.height / 100;
        }
        return res;
    }

    get avgThickness(){
        let {min, max} = this.thickness || {"min" : 1, "max": 1};
        return ((min||1) + (max||1)) / 2;
    }

    get avgLength(){
        let {min, max} = this.length|| {"min" : 1, "max": 1};
        return ((min||1) + (max||1)) / 2;
    }

    get offset(){
        let offset = this.layerIn? this.layerIn.offset: 0;
        let curr = this.prev;
        while (curr) {
            offset += curr.width;
            curr = curr.prev;
        }
        return offset;
    }
}

/**
 * Class that models regions
 */
export class Region extends Shape {

    /**
     * Create a Region resource from its JSON specification.
     * The method checks and sets default values to the region corner points if they are undefined.
     * @param   {Object} json                          - resource definition
     * @param   {Object} [modelClasses]                - map of class names vs implementation of ApiNATOMY resources
     * @param   {Map<string, Resource>} [entitiesByID] - map of resources in the global model
     * @returns {Shape} - ApiNATOMY Shape resource
     */
    static fromJSON(json, modelClasses = {}, entitiesByID) {
        if (!json.points || json.points.length < 3) {
            json.points = [
                {"x": -10, "y": -10 },
                {"x": -10, "y":  10 },
                {"x":  10, "y":  10 },
                {"x":  10, "y": -10 }
                ];
        }
        json.numBorders = json.points.length;
        let res = super.fromJSON(json, modelClasses, entitiesByID);
        res.points.push(res.points[0]::clone()); //make closed shape
        return res;
    }
}

/**
 * The class defining the border of a shape (lyph or region)
 * @class
 * @property host
 * @property borders
 *
 */
export class Border extends VisualResource {
    get isVisible(){
        return this.host? this.host.isVisible: super.isVisible;
    }
}


