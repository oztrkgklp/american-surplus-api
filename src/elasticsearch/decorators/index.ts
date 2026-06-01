/**
 * Elasticsearch Decorators
 * 
 * Custom decorators for Elasticsearch entity mapping
 */

export function EsEntity(indexName: string): ClassDecorator {
    return function (target: any) {
        Reflect.defineMetadata('es:entity', indexName, target);
    };
}

export function EsId(): PropertyDecorator {
    return function (target: any, propertyKey: string | symbol) {
        Reflect.defineMetadata('es:id', true, target, propertyKey);
    };
}

export function EsProperty(type: string): PropertyDecorator {
    return function (target: any, propertyKey: string | symbol) {
        Reflect.defineMetadata('es:property', type, target, propertyKey);
    };
}
