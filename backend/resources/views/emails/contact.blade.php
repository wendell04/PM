@component('mail::message')
# New Contact Form Submission

**Name:** {{ $name }}
<br>
**Email:** {{ $email }}
<br>
**Subject:** {{ $subject }}

**Message:**
<br>
{{ $message }}

Thanks,<br>
{{ config('app.name') }}
@endcomponent
