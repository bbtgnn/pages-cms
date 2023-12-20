import moment from 'moment';
import slugify from 'slugify';
import { transliterate } from 'transliteration';

export default function useSchema() {
  // Create a model from a list of fields and corresponding values
  const createModel = (fields, content = {}) => {
    let model = {};
    for (const field of fields) {
      if (field.list) {
        const listContent = Array.isArray(content[field.name]) ? content[field.name] : [];
        model[field.name] = listContent.length > 0 
          ? listContent.map(item => field.type === 'object' ? createModel(field.fields, item) : item) 
          : [getDefaultValue(field)];
      } else {
        model[field.name] = content.hasOwnProperty(field.name) 
          ? content[field.name] 
          : getDefaultValue(field);
      }
    }
    return model;
  };
  
  // Returns the default feld value based on its value and type
  const getDefaultValue = (field) => {
    if (field.default !== undefined) {
      return field.default;
    }
    switch (field.type) {
      case 'object':
        return createModel(field.fields, {});
      case 'boolean':
        return false;
      case 'date':
        return moment().format('YYYY-MM-DD');
      default:
        return '';
    }
  };
  
  // Traverse the object and remove all empty/null/undefined values
  const sanitizeObject = (obj) => {
    Object.keys(obj).forEach((key) => {
      const val = obj[key]
      if (!!val && typeof val === 'object') {
        const keys = Object.keys(val)
        if (!keys.length || keys.every((key) => !val[key])) {
          delete obj[key]
        }
        else if (!sanitizeObject(val)) {
          delete obj[key]
        }
      }
      else if (!val && typeof val != 'boolean') {
        delete obj[key]
      }
    });

    return !!Object.keys(obj).length;
  };

  // Retrieve the deepest matching content schema in the config for a file
  const getSchemaByPath = (config, path) => {
    // Normalize the file path
    const normalizedPath = `/${path}/`.replace(/\/\/+/g, '/');
  
    // Sort the entries by the depth of their path, and normalize them
    const matches = config.content
      .map(item => {
        const normalizedConfigPath = `/${item.path}/`.replace(/\/\/+/g, '/');
        return { ...item, path: normalizedConfigPath };
      })
      .filter(item => normalizedPath.startsWith(item.path))
      .sort((a, b) => b.path.length - a.path.length);
  
    // Return the first item in the sorted array which will be the deepest match, or undefined if no match
    return matches[0];
  };

  // Retrieve the matching schema for a type
  const getSchemaByName = (config, name) => {
    return config.content.find(item => item.name === name);
  };

  // TODO: revisit errors and maybe trigger some console.log
  // Helper function to generate a filename based on a pattern (and the model + schema)
  const generateFilename = (pattern, schema, model) => {
    // Replace date placeholders
    pattern = pattern.replace(/\{year\}/g, moment().format('YYYY'))
                    .replace(/\{month\}/g, moment().format('MM'))
                    .replace(/\{day\}/g, moment().format('DD'))
                    .replace(/\{hour\}/g, moment().format('HH'))
                    .replace(/\{minute\}/g, moment().format('mm'))
                    .replace(/\{second\}/g, moment().format('ss'));

    // Function to find a field in the schema
    function findFieldInSchema(schema, fieldName) {
      return schema.fields.find(field => field.name === fieldName);
    }

    // Safely access nested properties in an object
    function safeAccess(obj, path) {
      return path.split('.').reduce((acc, part) => {
        if (part.endsWith(']')) {
          const [arrayPath, index] = part.split('[');
          return (acc[arrayPath] || [])[parseInt(index.replace(']', ''), 10)];
        }
        return acc && acc[part];
      }, obj);
    }

    // Replace field placeholders
    return pattern.replace(/\{([^}]+)\}/g, (_, key) => {
      let value;
      if (key.startsWith('fields.')) {
        key = key.replace('fields.', '');
        const field = findFieldInSchema(schema, key);
        if (!field) {
          throw new Error(`Field '${key}' not found in schema`);
        }
        value = safeAccess(model, key);
      } else {
        const field = findFieldInSchema(schema, key);
        if (!field) {
          throw new Error(`Field '${key}' not found in schema`);
        }
        value = model[key];
      }

      if (value === undefined) {
        throw new Error(`Field '${key}' not found in model`);
      }

      return slugify(transliterate(String(value)), { lower: true, strict: true });
    });
  };

  return { createModel, getDefaultValue, sanitizeObject, getSchemaByPath, getSchemaByName, generateFilename };
}

// TODO: add some sort of schema check to make things are properly configured (e.g. fields are correctly formed, etc)