# Design

This package exposes TypeScript target contracts.

Each file in `src/` represents a concrete runtime or build target.
The target name must describe the environment precisely.

Do not add vague `base`, `default`, or `recommended` configs.
Do not create multiple equivalent ways to configure the same target.
