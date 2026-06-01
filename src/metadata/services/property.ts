import PropertyType from '@/metadata/models/PropertyType';
import DemilCondition from '@/metadata/models/DemilCondition';
import DisposalCondition from '@/metadata/models/DisposalCondition';
import SupplyCondition from '@/metadata/models/SupplyCondition';
import { PropertyElasticsearchService } from '@/ppms/services/propertyElasticsearch.service';

export class PropertyMetadataService {
    /**
     * Fetch all demil conditions.
     * @returns An array of demil conditions.
     */
    static async getDemilConditions() {
        const demilConditions = await DemilCondition.findAll();
        return demilConditions;
    }

    /**
     * Fetch all disposal conditions.
     * @returns An array of disposal conditions.
     */
    static async getDisposalConditions() {
        const disposalConditions = await DisposalCondition.findAll();
        return disposalConditions;
    }

    /**
     * Fetch all property types.
     * @returns An array of property types.
     */
    static async getPropertyTypes() {
        const propertyTypes = await PropertyType.findAll();
        return propertyTypes;
    }

    /**
     * Fetch all supply conditions.
     * @returns An array of supply conditions.
     */
    static async getSupplyConditions() {
        const supplyConditions = await SupplyCondition.findAll();
        return supplyConditions;
    }

    /**
    * Fetch all categories.
    * @returns An array of categories.
    */
    static async getCategories() {
        const categories = await PropertyElasticsearchService.getCategories();
        return categories;
    }
}


