import {Component} from '@angular/core';
import {
    MatDialogRef
} from '@angular/material';

@Component({
    selector: 'importExcelModelDialog',
    template:`
        <h1 mat-dialog-title>Import model from Google spreadsheets</h1>
        <div mat-dialog-content>
            <mat-form-field class="full-width">
                <input matInput class="w3-input"
                       placeholder="spreadsheet-id"
                       matTooltip="Insert spreadsheet-id"
                       type="text"
                       aria-label="Spreadsheet identifier"
                       [(ngModel)]="spreadsheetID"
                >
            </mat-form-field>
        </div>
        <div mat-dialog-actions align="end">
            <button mat-button (click)="onNoClick()">Cancel</button>
            <button mat-button [mat-dialog-close]="spreadsheetID" cdkFocusInitial>OK</button>
        </div>
    `,
    styles: [`
        .full-width {
          width: 100%;
        }
    `]
})
export class ImportExcelModelDialog {
    spreadsheetID = "2PACX-1vS7gSCCBvoJYUKNKG3uHlRIUODua1XDUQFJPMS0Udt_carYGqJ5oONpXwgCkli9K9FHX3HjqZ5XllLe";
    dialogRef;

    constructor(dialogRef: MatDialogRef) {
        this.dialogRef = dialogRef;
    }

    onNoClick(){
        this.dialogRef.close();
    }
}

