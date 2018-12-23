import {NgModule, Component, Input, Output, EventEmitter, Inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {MatExpansionModule, MatDividerModule, MatFormFieldModule, MatInputModule, MatCheckboxModule,
    MatCardModule, MatDialogModule, MatDialog, MatDialogRef, MAT_DIALOG_DATA} from '@angular/material';
import {ResourceInfoModule} from "./resourceInfo";
import {FieldEditorModule}  from "./fieldEditor";
import {ResourceEditorDialog}  from "./resourceEditorDialog";
import {getClassName} from "../../models/resourceModel";
import {isPlainObject} from 'lodash-bound';

@Component({
    selector: 'resourceEditor',
    template: `
        <mat-expansion-panel [expanded]="expanded">
            <mat-expansion-panel-header>
                <mat-panel-title>
                    {{className}}: {{resource?.id || "?"}} - {{resource?.name || "?"}}
                </mat-panel-title>
            </mat-expansion-panel-header>

            <mat-card class="w3-margin w3-grey">
                <section *ngFor="let field of _propertyFields">
                    <fieldEditor
                            [value]="resource[field[0]]"
                            [label]="field[0]"
                            [spec]="field[1]"
                            (onValueChange)="updateValue(field, $event)">
                    </fieldEditor>
                </section>
            </mat-card>
            <mat-card class="w3-margin w3-grey">
                <mat-expansion-panel *ngFor="let field of _relationshipFields" class="w3-margin-bottom">
                    <mat-expansion-panel-header>
                        <mat-panel-title>
                            {{field[0]}}
                        </mat-panel-title>
                    </mat-expansion-panel-header>

                    <section *ngFor="let other of resource[field[0]]; let i = index">
                        {{other.id}} - {{other.name || "?"}}
                        <mat-action-row>
                            <button *ngIf="isObject(other)" 
                                    class="w3-hover-light-grey" (click)="editResource(field, other)">
                                <i class="fa fa-edit"></i>
                            </button>
                            <button class="w3-hover-light-grey" (click)="removeResource(field, i)">
                                <i class="fa fa-trash"></i>
                            </button>
                        </mat-action-row>
                    </section>

                    <mat-action-row>
                        <button class="w3-hover-light-grey" (click)="createResource(field)">
                            <i class="fa fa-plus"></i>
                        </button>
                    </mat-action-row>

                </mat-expansion-panel>
            </mat-card>

        </mat-expansion-panel>
    `
})
export class ResourceEditor {
    //Input: resource, className, modelClasses

    _resource;
    _className;

    _propertyFields     = [];
    _relationshipFields = [];
    dialog: MatDialog;

    @Input() modelClasses;

    @Input() expanded = false;

    @Input('resource') set resource(newValue) {
        this._resource = newValue;
    }

    @Input('className') set className(newValue) {
        this._className = newValue;
        if (this.modelClasses){
            this._propertyFields     = this.modelClasses[this._className].Model.cudProperties;
            this._relationshipFields = this.modelClasses[this._className].Model.cudRelationships;
        }
    }

    get resource(){
        return this._resource;
    }

    get className(){
        return this._className;
    }

    isObject(value){
        return value::isPlainObject();
    }

    updateValue([key, spec], value){
        this.resource[key] = value;
    }

    constructor(dialog: MatDialog) {
        this.dialog = dialog;
    }


    removeResource([key, spec], index){
        this.resource[key].splice(index, 1);
    }

    editResource([key, spec], model){
        let className = getClassName(spec);

        const dialogRef = this.dialog.open(ResourceEditorDialog, {
            width: '75%',
            data: {
                title       : `Update resource?`,
                resource    : model,
                className   : className,
                modelClasses: this.modelClasses}
        });

        dialogRef.afterClosed().subscribe(result => {
            //?
        });
    }

    includeResource([key, spec], model){

    }

    createResource([key, spec]) {
        let model = {};
        let className = getClassName(spec);

        const dialogRef = this.dialog.open(ResourceEditorDialog, {
            width: '75%',
            data: {
                title       : `Create new resource?`,
                resource    : model,
                className   : className,
                modelClasses: this.modelClasses}
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                if (!this.resource[key]){ this.resource[key] = []; }
                this.resource[key].push(model);
            }
        });
    }


}

@NgModule({
    imports: [FormsModule, BrowserAnimationsModule, ResourceInfoModule,
        MatExpansionModule, MatDividerModule, MatFormFieldModule, MatInputModule, MatDialogModule,
        MatCheckboxModule, MatCardModule, FieldEditorModule],
    declarations: [ResourceEditor, ResourceEditorDialog],
    entryComponents: [ResourceEditorDialog],
    exports: [ResourceEditor]
})
export class ResourceEditorModule {

}