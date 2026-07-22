<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreAddressRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'label'        => ['nullable', 'string', 'max:50'],
            'house_number' => ['required', 'string', 'max:100'],
            'street'       => ['required', 'string', 'max:100'],
            'subdivision'  => ['nullable', 'string', 'max:100'],
            'delivery_notes' => ['nullable', 'string', 'max:300'],
            'region'        => ['required', 'string', 'max:100'],
            'region_code'   => ['required', 'string', 'max:20'],
            'province'      => ['required', 'string', 'max:100'],
            'province_code' => ['nullable', 'string', 'max:20'],
            'city'          => ['required', 'string', 'max:100'],
            'city_code'     => ['required', 'string', 'max:20'],
            'barangay'      => ['required', 'string', 'max:100'],
            'barangay_code' => ['required', 'string', 'max:20'],
            'zip'          => ['required', 'string', 'regex:/^\d{4}$/'],
            'phone'        => ['required', 'string',
                               'regex:/^(09|\+639)\d{9}$/'],
            'is_default'   => ['sometimes', 'boolean'],
            'lat'          => ['nullable', 'numeric', 'between:-90,90'],
            'lng'          => ['nullable', 'numeric', 'between:-180,180'],
        ];
    }

    public function messages(): array
    {
        return [
            'phone.regex'       => 'Phone must be a valid PH number (09XXXXXXXXX or +639XXXXXXXXX).',
            'zip.regex'         => 'ZIP/Postal code must be exactly 4 digits.',
            'house_number.required' => 'House/Unit number is required.',
            'street.required'   => 'Street address is required.',
            'region.required'   => 'Region is required.',
            'region_code.required'   => 'Please select a region.',
            'barangay.required' => 'Barangay is required.',
            'barangay_code.required' => 'Please select a barangay.',
            'city.required'     => 'City/Municipality is required.',
            'city_code.required'     => 'Please select a city/municipality.',
            'province.required' => 'Province is required.',
        ];
    }
}
