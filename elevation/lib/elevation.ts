/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, LitElement} from 'lit';

/**
 * A component for elevation.
 */
export class Elevation extends LitElement {
  override render() {
    return html`<span class="shadow"></span>`;
  }
}
