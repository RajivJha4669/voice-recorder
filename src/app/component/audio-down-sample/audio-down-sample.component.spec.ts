/* tslint:disable:no-unused-variable */
import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DebugElement } from '@angular/core';

import { AudioDownSampleComponent } from './audio-down-sample.component';

describe('AudioDownSampleComponent', () => {
  let component: AudioDownSampleComponent;
  let fixture: ComponentFixture<AudioDownSampleComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ AudioDownSampleComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AudioDownSampleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
