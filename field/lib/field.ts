/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, LitElement, nothing, PropertyValues, TemplateResult} from 'lit';
import {property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {SurfacePositionTarget} from '../../menu/lib/surfacePositionController.js';

import {EASING} from '../../motion/animation.js';

/**
 * A field component.
 */
export class Field extends LitElement implements SurfacePositionTarget {
  @property({type: Boolean}) disabled = false;
  @property({type: Boolean}) error = false;
  @property({type: Boolean}) focused = false;
  @property() label?: string;
  @property({type: Boolean}) populated = false;
  @property({type: Boolean}) resizable = false;
  @property({type: Boolean}) required = false;

  /**
   * Whether or not the field has leading content.
   */
  @property({type: Boolean}) hasStart = false;

  /**
   * Whether or not the field has trailing content.
   */
  @property({type: Boolean}) hasEnd = false;

  @state() private isAnimating = false;
  private labelAnimation?: Animation;
  @query('.label.floating') private readonly floatingLabelEl!: HTMLElement|null;
  @query('.label.resting') private readonly restingLabelEl!: HTMLElement|null;
  @query('.container') private readonly containerEl!: HTMLElement|null;

  protected override update(props: PropertyValues<Field>) {
    // Client-side property updates

    // When disabling, remove focus styles if focused.
    if (this.disabled && this.focused) {
      props.set('focused', true);
      this.focused = false;
    }

    // Animate if focused or populated change.
    this.animateLabelIfNeeded({
      wasFocused: props.get('focused'),
      wasPopulated: props.get('populated')
    });

    super.update(props);
  }

  protected override render() {
    const floatingLabel = this.renderLabel(/*isFloating*/ true);
    const restingLabel = this.renderLabel(/*isFloating*/ false);
    const outline = this.renderOutline?.(floatingLabel);
    const classes = {
      'disabled': this.disabled,
      'error': this.error && !this.disabled,
      'focused': this.focused,
      'with-start': this.hasStart,
      'with-end': this.hasEnd,
      'populated': this.populated,
      'resizable': this.resizable,
      'required': this.required,
      'no-label': !this.label,
    };

    return html`
      <div class="field ${classMap(classes)}">
        <div class="container-overflow">
          ${outline}
          ${this.renderBackground?.()}
          ${this.renderIndicator?.()}
          <div class="container">
            <div class="start">
              <slot name="start"></slot>
            </div>
            <div class="middle">
              ${restingLabel}
              ${outline ? nothing : floatingLabel}
              <div class="content">
                <slot></slot>
              </div>
            </div>
            <div class="end">
              <slot name="end"></slot>
            </div>
          </div>
        </div>

        <div class="supporting-text">
          <div class="supporting-text-start">
            <slot name="supporting-text"></slot>
          </div>
          <div class="supporting-text-end">
            <slot name="supporting-text-end"></slot>
          </div>
        </div>
      </div>
    `;
  }

  protected renderBackground?(): TemplateResult;
  protected renderIndicator?(): TemplateResult;
  protected renderOutline?(floatingLabel: TemplateResult): TemplateResult;

  private renderLabel(isFloating: boolean) {
    let visible: boolean;
    if (isFloating) {
      // Floating label is visible when focused/populated or when animating.
      visible = this.focused || this.populated || this.isAnimating;
    } else {
      // Resting label is visible when unfocused. It is never visible while
      // animating.
      visible = !this.focused && !this.populated && !this.isAnimating;
    }

    const classes = {
      'hidden': !visible,
      'floating': isFloating,
      'resting': !isFloating,
    };

    let labelText = this.label ?? '';
    // Add '*' if a label is present and the field is required
    labelText += this.required && labelText ? '*' : '';

    return html`
      <span class="label ${classMap(classes)}"
        aria-hidden=${!visible}
      >${labelText}</span>
    `;
  }

  private animateLabelIfNeeded({wasFocused, wasPopulated}: {
    wasFocused?: boolean,
    wasPopulated?: boolean
  }) {
    if (!this.label) {
      return;
    }

    wasFocused ??= this.focused;
    wasPopulated ??= this.populated;
    const wasFloating = wasFocused || wasPopulated;
    const shouldBeFloating = this.focused || this.populated;
    if (wasFloating === shouldBeFloating) {
      return;
    }

    this.isAnimating = true;
    this.labelAnimation?.cancel();

    // Only one label is visible at a time for clearer text rendering.
    // The floating label is visible and used during animation. At the end of
    // the animation, it will either remain visible (if floating) or hide and
    // the resting label will be shown.
    //
    // We don't use forward filling because if the dimensions of the text field
    // change (leading icon removed, density changes, etc), then the animation
    // will be inaccurate.
    //
    // Re-calculating the animation each time will prevent any visual glitches
    // from appearing.
    // TODO(b/241113345): use animation tokens
    this.labelAnimation = this.floatingLabelEl?.animate(
        this.getLabelKeyframes(), {duration: 150, easing: EASING.STANDARD});

    this.labelAnimation?.addEventListener('finish', () => {
      // At the end of the animation, update the visible label.
      this.isAnimating = false;
    });
  }

  private getLabelKeyframes() {
    const {floatingLabelEl, restingLabelEl} = this;
    if (!floatingLabelEl || !restingLabelEl) {
      return [];
    }

    const {x: floatingX, y: floatingY, height: floatingHeight} =
        floatingLabelEl.getBoundingClientRect();
    const {x: restingX, y: restingY, height: restingHeight} =
        restingLabelEl.getBoundingClientRect();
    const floatingScrollWidth = floatingLabelEl.scrollWidth;
    const restingScrollWidth = restingLabelEl.scrollWidth;
    // Scale by width ratio instead of font size since letter-spacing will scale
    // incorrectly. Using the width we can better approximate the adjusted
    // scale and compensate for tracking and overflow.
    // (use scrollWidth instead of width to account for clipped labels)
    const scale = restingScrollWidth / floatingScrollWidth;
    const xDelta = restingX - floatingX;
    // The line-height of the resting and floating label are different. When
    // we move the floating label down to the resting label's position, it won't
    // exactly match because of this. We need to adjust by half of what the
    // final scaled floating label's height will be.
    const yDelta = restingY - floatingY +
        Math.round((restingHeight - floatingHeight * scale) / 2);

    // Create the two transforms: floating to resting (using the calculations
    // above), and resting to floating (re-setting the transform to initial
    // values).
    const restTransform =
        `translateX(${xDelta}px) translateY(${yDelta}px) scale(${scale})`;
    const floatTransform = `translateX(0) translateY(0) scale(1)`;

    // Constrain the floating labels width to a scaled percentage of the
    // resting label's width. This will prevent long clipped labels from
    // overflowing the container.
    const restingClientWidth = restingLabelEl.clientWidth;
    const isRestingClipped = restingScrollWidth > restingClientWidth;
    const width = isRestingClipped ? `${restingClientWidth / scale}px` : '';
    if (this.focused || this.populated) {
      return [
        {transform: restTransform, width}, {transform: floatTransform, width}
      ];
    }

    return [
      {transform: floatTransform, width}, {transform: restTransform, width}
    ];
  }

  getSurfacePositionClientRect() {
    return this.containerEl!.getBoundingClientRect();
  }
}
