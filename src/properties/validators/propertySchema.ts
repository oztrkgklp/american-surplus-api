import * as yup from 'yup';

type Props = {
    propertyTypes: readonly string[];
    disposalConditions: readonly string[];
    supplyConditions: readonly string[];
    demilConditions: readonly string[];
    ignoreSurplusReleaseDate: boolean;
}

export const manualPropertySchema = (props: Props) => yup.object({
    property_reimbursable: yup.boolean()
        .required('Reimbursable is required')
        .oneOf([true, false], 'Invalid Reimbursable selection'),
    property_control_number: yup.string()
        .required('Item Control Number is required')
        .typeError('Item Control Number must be a string'),
    property_surplus_release_date: yup.number()
        .required('Surplus Release Date is required')
        .typeError('Surplus Release Date must be a valid timestamp')
        .when([], {
            is: () => !props.ignoreSurplusReleaseDate,
            then: schema => schema.min(Date.now(), 'Surplus Release Date must be in the future'),
            otherwise: schema => schema
        }),
    property_name: yup.string()
        .required('Item Name is required')
        .min(2, 'Item Name must be at least ${min} characters'),
    property_type: yup.string()
        .required('Property Type is required')
        .oneOf(props.propertyTypes, 'Invalid Property Type selection'),
    property_description: yup.string()
        .required('Item Description is required')
        .min(2, 'Item Description must be at least ${min} characters')
        .max(3000, 'Item Description must be at most ${max} characters'),
    property_justification: yup.string()
        .required('Item Justification is required')
        .min(2, 'Item Justification must be at least ${min} characters')
        .max(100, 'Item Justification must be at most ${max} characters'),
    property_justification_extended: yup.string()
        .nullable()
        .notRequired()
        .max(5000, 'Additional justification must be at most 5000 characters')
        .transform((value, originalValue) => originalValue === '' ? null : value),
    property_quantity: yup.number()
        .required('Item Quantity is required')
        .typeError('Item Quantity must be a number')
        .integer('Item Quantity must be an integer')
        .positive('Item Quantity must be greater than 0'),
    property_original_value: yup.number()
        .required('Item Original Value is required')
        .typeError('Item Original Value must be a number')
        .min(0, 'Item Original Value must be at least ${min}'),
    property_total_value: yup.number()
        .required('Item Total Value is required')
        .typeError('Item Total Value must be a number')
        .min(0, 'Item Total Value must be greater than ${min}'),
    property_fair_market_value: yup.number()
        .nullable()
        .notRequired()
        .typeError('Item Fair Market Value must be a number')
        .min(0, 'Item Fair Market Value must be greater than ${min}')
        .positive('Item Fair Market Value must be greater than 0')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_disposal_condition: yup.string()
        .nullable()
        .notRequired()
        .typeError('Disposal Condition must be a string')
        .oneOf(props.disposalConditions, 'Invalid Disposal Condition selection')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_supply_condition: yup.string()
        .nullable()
        .notRequired()
        .typeError('Supply Condition must be a string')
        .oneOf(props.supplyConditions, 'Invalid Supply Condition selection')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_demil_condition: yup.string()
        .nullable()
        .notRequired()
        .typeError('Demil Condition must be a string')
        .oneOf(props.demilConditions, 'Invalid Demil Condition selection')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_location_address_one: yup.string()
        .nullable()
        .notRequired()
        .typeError('Property Location Address 1 must be a string')
        .min(2, 'Property Location Address 1 must be at least ${min} characters')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_location_address_two: yup.string()
        .nullable()
        .notRequired()
        .typeError('Property Location Address 2 must be a string')
        .min(2, 'Property Location Address 2 must be at least ${min} characters')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_location_address_three: yup.string()
        .nullable()
        .notRequired()
        .typeError('Property Location Address Three must be a string')
        .min(2, 'Property Location Address Three must be at least ${min} characters')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_location_city: yup.string()
        .nullable()
        .notRequired()
        .typeError('Property Location City must be a string')
        .min(2, 'Property Location City must be at least ${min} characters')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_location_region_state: yup.string()
        .nullable()
        .notRequired()
        .typeError('Property Location Region/State must be a string')
        .min(2, 'Property Location Region/State must be at least ${min} characters')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_location_postal_code: yup.string()
        .nullable()
        .notRequired()
        .typeError('Property Location Postal Code must be a number')
        .min(2, 'Property Location Postal Code must be at least ${min} characters')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_poc_name: yup.string()
        .nullable()
        .notRequired()
        .typeError('Point of Contact Name must be a string')
        .min(2, 'Point of Contact Name must be at least ${min} characters')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_poc_phone: yup.string()
        .nullable()
        .notRequired()
        .typeError('Point of Contact Phone must be a string')
        .matches(/^[0-9]{10}$/, 'Point of Contact Phone must be a valid phone number')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_poc_email: yup.string()
        .nullable()
        .notRequired()
        .email('Point of Contact Email must be a valid email address')
        .typeError('Point of Contact Email Address must be a string')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_poc_email_cc: yup.string()
        .nullable()
        .notRequired()
        .email('Point of Contact CC Email Address must be a valid email address')
        .typeError('Point of Contact CC Email Address must be a string')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_custodian_reporting_agency: yup.string()
        .nullable()
        .notRequired()
        .typeError('Custodian Reporting Agency must be a string')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_custodian_name: yup.string()
        .nullable()
        .notRequired()
        .typeError('Custodian Name must be a string')
        .min(2, 'Custodian Name must be at least ${min} characters')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_custodian_phone: yup.string()
        .nullable()
        .notRequired()
        .typeError('Custodian Phone must be a string')
        .matches(/^[0-9]{10}$/, 'Custodian Phone must be a valid phone number')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_custodian_email: yup.string()
        .nullable()
        .notRequired()
        .email('Custodian Email must be a valid email address')
        .typeError('Custodian Email Address must be a string')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_custodian_email_cc: yup.string()
        .nullable()
        .notRequired()
        .email('Custodian CC Email Address must be a valid email address')
        .typeError('Custodian CC Email Address must be a string')
        .transform((value, originalValue) => originalValue === "" ? null : value),
});

export const automaticPropertySchema = () => yup.object({
    property_control_number: yup.string()
        .required('Item Control Number is required')
        .typeError('Item Control Number must be a string'),
    property_justification: yup.string()
        .required('Item Justification is required')
        .min(2, 'Item Justification must be at least ${min} characters')
        .max(100, 'Item Justification must be at most ${max} characters'),
    property_justification_extended: yup.string()
        .nullable()
        .notRequired()
        .max(5000, 'Additional justification must be at most ${max} characters')
        .transform((value, originalValue) => originalValue === "" ? null : value),
    property_quantity: yup.number()
        .required('Item Quantity is required')
        .typeError('Item Quantity must be a number')
        .integer('Item Quantity must be an integer')
        .positive('Item Quantity must be greater than 0'),
});

export const updatePropertySchema = (props: Props) => yup.object({
    property_reimbursable: yup.boolean()
        .notRequired()
        .oneOf([true, false], 'Invalid Reimbursable selection'),
    property_surplus_release_date: yup.number()
        .notRequired()
        .typeError('Surplus Release Date must be a valid timestamp')
        .when([], {
            is: () => !props.ignoreSurplusReleaseDate,
            then: schema => schema.min(Date.now(), 'Surplus Release Date must be in the future'),
            otherwise: schema => schema
        }),
    property_name: yup.string()
        .notRequired()
        .min(2, 'Item Name must be at least ${min} characters'),
    property_type: yup.string()
        .notRequired()
        .oneOf(props.propertyTypes, 'Invalid Property Type selection'),
    property_description: yup.string()
        .notRequired()
        .min(2, 'Item Description must be at least ${min} characters')
        .max(3000, 'Item Description must be at most ${max} characters'),
    property_justification: yup.string()
        .notRequired()
        .min(2, 'Item Justification must be at least ${min} characters')
        .max(100, 'Item Justification must be at most ${max} characters'),
    property_justification_extended: yup.string()
        .nullable()
        .notRequired()
        .max(5000, 'Additional justification must be at most 5000 characters')
        .transform((value, originalValue) => originalValue === '' ? null : value),
    property_quantity: yup.number()
        .notRequired()
        .typeError('Item Quantity must be a number')
        .integer('Item Quantity must be an integer')
        .positive('Item Quantity must be greater than 0'),
    property_original_value: yup.number()
        .notRequired()
        .typeError('Item Original Value must be a number')
        .min(0, 'Item Original Value must be at least ${min}'),
    property_total_value: yup.number()
        .notRequired()
        .typeError('Item Total Value must be a number')
        .min(0, 'Item Total Value must be greater than ${min}'),
    property_fair_market_value: yup.number()
        .notRequired()
        .typeError('Item Fair Market Value must be a number')
        .min(0, 'Item Fair Market Value must be greater than ${min}')
        .positive('Item Fair Market Value must be greater than 0'),
    property_disposal_condition: yup.string()
        .notRequired()
        .typeError('Disposal Condition must be a string')
        .oneOf(props.disposalConditions, 'Invalid Disposal Condition selection'),
    property_supply_condition: yup.string()
        .notRequired()
        .typeError('Supply Condition must be a string')
        .oneOf(props.supplyConditions, 'Invalid Supply Condition selection'),
    property_demil_condition: yup.string()
        .notRequired()
        .typeError('Demil Condition must be a string')
        .oneOf(props.demilConditions, 'Invalid Demil Condition selection'),
    property_location_address_one: yup.string()
        .notRequired()
        .typeError('Property Location Address 1 must be a string')
        .min(2, 'Property Location Address 1 must be at least ${min} characters'),
    property_location_address_two: yup.string()
        .notRequired()
        .typeError('Property Location Address 2 must be a string')
        .min(2, 'Property Location Address 2 must be at least ${min} characters'),
    property_location_address_three: yup.string()
        .notRequired()
        .typeError('Property Location Address Three must be a string')
        .min(2, 'Property Location Address Three must be at least ${min} characters'),
    property_location_city: yup.string()
        .notRequired()
        .typeError('Property Location City must be a string')
        .min(2, 'Property Location City must be at least ${min} characters'),
    property_location_region_state: yup.string()
        .notRequired()
        .typeError('Property Location Region/State must be a string')
        .min(2, 'Property Location Region/State must be at least ${min} characters'),
    property_location_postal_code: yup.string()
        .notRequired()
        .typeError('Property Location Postal Code must be a number')
        .min(2, 'Property Location Postal Code must be at least ${min} characters'),
    property_poc_name: yup.string()
        .notRequired()
        .typeError('Point of Contact Name must be a string')
        .min(2, 'Point of Contact Name must be at least ${min} characters'),
    property_poc_phone: yup.string()
        .notRequired()
        .typeError('Point of Contact Phone must be a string')
        .matches(/^[0-9]{10}$/, 'Point of Contact Phone must be a valid phone number'),
    property_poc_email: yup.string()
        .notRequired()
        .email('Point of Contact Email must be a valid email address')
        .typeError('Point of Contact Email Address must be a string'),
    property_poc_email_cc: yup.string()
        .notRequired()
        .email('Point of Contact CC Email Address must be a valid email address')
        .typeError('Point of Contact CC Email Address must be a string'),
    property_custodian_reporting_agency: yup.string()
        .notRequired()
        .typeError('Custodian Reporting Agency must be a string'),
    property_custodian_name: yup.string()
        .notRequired()
        .typeError('Custodian Name must be a string')
        .min(2, 'Custodian Name must be at least ${min} characters'),
    property_custodian_phone: yup.string()
        .notRequired()
        .typeError('Custodian Phone must be a string')
        .matches(/^[0-9]{10}$/, 'Custodian Phone must be a valid phone number'),
    property_custodian_email: yup.string()
        .notRequired()
        .email('Custodian Email must be a valid email address')
        .typeError('Custodian Email Address must be a string'),
    property_custodian_email_cc: yup.string()
        .typeError('Custodian CC Email Address must be a string'),
});

export const propertyCancellationSchema = yup.object({
    propertyIds: yup.array()
        .of(yup.number().integer().positive())
        .required('Property IDs are required')
        .min(1, 'At least one property must be selected for cancellation'),
    cancellationReason: yup.string()
        .transform((val) => (typeof val === 'string' ? val.trim() : val))
        .required('Cancellation reason is required')
        .min(10, 'Cancellation reason must be at least ${min} characters')
        .max(500, 'Cancellation reason must be at most ${max} characters')
        .test(
            'at-least-10-letters',
            'Cancellation reason must include at least 10 letters (A-Z).',
            (value) => {
                if (typeof value !== 'string') return false;
                const letters = (value.match(/[A-Za-z]/g) || []).length;
                return letters >= 10;
            }
        )
        .test('not-empty-trimmed', 'Cancellation reason cannot be empty or whitespace', (val) => !!val && val.trim().length > 0)
        .test('has-alphanumeric', 'Cancellation reason must contain at least one letter or digit', (val) => !!val && /[A-Za-z0-9]/.test(val))
        .typeError('Cancellation reason must be a string'),
});