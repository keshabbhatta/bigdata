// The data model is shared with the React app so both sides validate records the
// same way. See shared/schema.js for entities, fields and clinical fields.
export { ENTITIES, WARDS, SCHEMA_VERSION, isClinical, validateChanges, upcastEvent } from '../../../shared/schema.js';
