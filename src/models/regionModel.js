import * as three from 'three';
const THREE = window.THREE || three;
import {Shape} from './shapeModel';
import { clone } from 'lodash-bound';
import {createMeshWithBorder, getCenterOfMass} from '../three/utils';

/**
 * Class that creates visualization objects of regions
 */
export class Region extends Shape {

    static fromJSON(json, modelClasses = {}, entitiesByID = null) {
        if (!json.points || json.points.length < 3) {
            json.points = [{"x": -10, "y": -10 },{"x": -10, "y": 10 },{"x": 10, "y": 10 },{"x": 10, "y": -10 }];
        }
        json.numBorders = json.points.length;
        let res = super.fromJSON(json, modelClasses, entitiesByID);
        res.points.push(res.points[0]::clone()); //make closed shape
        res.points = res.points.map(p => new THREE.Vector3(p.x, p.y, 0));
        return res;
    }

    get polygonOffsetFactor() {
        return 1; //always behind
    }

    translate(p0) {
        if (!p0 || !this.viewObjects["main"]) { return p0; }
        return p0.clone();
    }

    /**
     * Create view model for the class instance
     * @param state - layout settings
     */
    createViewObjects(state) {
        if (!this.viewObjects["main"]) {

            let shape = new THREE.Shape(this.points.map(p => new THREE.Vector2(p.x, p.y))); //Expects Vector2
            this.center = getCenterOfMass(this.points);

            let obj = createMeshWithBorder(shape, {
                color: this.color,
                polygonOffsetFactor: this.polygonOffsetFactor
            });
            obj.userData = this;
            this.viewObjects['main'] = obj;

            this.border.createViewObjects(state);
        }

        this.createLabels(state);
    }

    /**
     * Update positions of regions in the force-directed graph (and their inner content)
     * @param state - view settings
     */
    updateViewObjects(state) {
        // const linkObj = this.viewObjects["main"];
        // if (!linkObj) { return; }
        // // Update buffer geometry
        // let linkPos = linkObj.geometry.attributes && linkObj.geometry.attributes.position;
        // if (linkPos) {
        //     for (let i = 0; i < this.points.length; i++) {
        //         linkPos.array[3 * i] = this.points[i].x;
        //         linkPos.array[3 * i + 1] = this.points[i].y;
        //         linkPos.array[3 * i + 2] = 0;
        //     }
        //     linkPos.needsUpdate = true;
        //     linkObj.geometry.computeBoundingSphere();
        // }

        this.border.updateViewObjects(state);

        this.updateLabels(state, this.center.clone().addScalar(5));
    }
}
