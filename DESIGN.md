---
version: "alpha"
name: "Anderssons TidApp"
description: "Designsystem for Anderssons Isolering's time reporting app."
colors:
  ink: "#08090A"
  graphite: "#1F2428"
  muted: "#6B7280"
  surface: "#FFFFFF"
  surface-soft: "#F4F7FA"
  primary: "#5E6AD2"
  primary-dark: "#3842A7"
  success: "#047857"
  warning: "#B45309"
  danger: "#BE123C"
  sky: "#0369A1"
typography:
  page-title:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0px"
  section-title:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0px"
  body:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0px"
  label:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0px"
rounded:
  sm: 6px
  md: 8px
  lg: 12px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: 12px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    padding: 12px
  caption:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: 4px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.lg}"
    padding: 16px
  card-muted:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.lg}"
    padding: 16px
  sidebar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
  status-ok:
    backgroundColor: "{colors.success}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: 6px
  status-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: 6px
  status-risk:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: 6px
  quick-link:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: 10px
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: 12px
---

## Overview

TidApp is a field-first operational app for insulation work. It should feel fast, calm, and practical rather than decorative. The interface must help employees report time quickly and help managers see what needs action.

## Colors

Use black, graphite, white, and soft grey as the base. Use primary blue for navigation, main actions, and focused state. Use green for completed work, amber for reminders, and rose only for real risk or blocked workflows.

Avoid money-oriented color language and avoid making the UI feel like accounting software. The product focus is time, weeks, projects, people, and follow-up.

## Typography

Use compact, readable text. Large type belongs on the dashboard command area only. Tables, forms, cards, and settings screens should use tighter headings and clear labels.

## Layout

Prioritize mobile and repeated daily use. Primary actions should be reachable without scanning the whole page. Keep dashboards short and action-oriented: one clear next step, then supporting status.

## Elevation & Depth

Use subtle depth for clickable cards and panels. Avoid decorative floating sections. Cards should communicate grouping, not marketing.

## Shapes

Use moderate radius: 6px to 12px. Avoid overly round pill-heavy layouts except for small status chips.

## Components

Buttons need clear hierarchy. Primary buttons are for reporting time, opening attest, and submitting weeks. Secondary buttons are for navigation and review.

Status chips should be short and factual: "Vantar", "OK", "Risk", "Komplett". Avoid long explanatory chips.

## Do's and Don'ts

Do make missing time obvious.
Do show the Anderssons Isolering logo in stable brand areas.
Do keep reports and exports available but visually secondary.
Do design for workers using the app quickly on mobile.

Don't surface money, invoice state, billable value, or billing workflow in dashboards.
Don't make the first screen a landing page.
Don't add decorative graphics that do not help time reporting.
Don't use negative letter spacing or viewport-scaled text.
