/**
 * SOAP mock server sample configurations.
 * Pre-built operation sets for quick testing.
 * 5 WSDL-only samples + 5 WSDL+XSD samples (with richer type definitions).
 */

export interface SoapSampleConfig {
  id: string;
  label: string;
  description: string;
  hasXsd?: boolean;
  operations: Array<{
    service: string;
    operation: string;
    soapAction: string;
    responseType: 'static' | 'fault';
    response: string;
    faultCode?: string;
    faultString?: string;
  }>;
}

export const SOAP_MOCK_SAMPLES: SoapSampleConfig[] = [
  {
    id: 'calculator',
    label: 'Calculator Service',
    description: 'Basic arithmetic operations with static responses',
    operations: [
      {
        service: 'CalculatorService',
        operation: 'Add',
        soapAction: 'http://calculator.daakia.dev/Add',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://calculator.daakia.dev/">
  <soap:Body>
    <tns:AddResponse>
      <tns:result>42</tns:result>
    </tns:AddResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'CalculatorService',
        operation: 'Subtract',
        soapAction: 'http://calculator.daakia.dev/Subtract',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://calculator.daakia.dev/">
  <soap:Body>
    <tns:SubtractResponse>
      <tns:result>8</tns:result>
    </tns:SubtractResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'CalculatorService',
        operation: 'Divide',
        soapAction: 'http://calculator.daakia.dev/Divide',
        responseType: 'fault',
        response: '',
        faultCode: 'soap:Server',
        faultString: 'Division by zero',
      },
    ],
  },
  {
    id: 'weather',
    label: 'Weather Service',
    description: 'Weather lookup operations with city-based responses',
    operations: [
      {
        service: 'WeatherService',
        operation: 'GetWeather',
        soapAction: 'http://weather.daakia.dev/GetWeather',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://weather.daakia.dev/">
  <soap:Body>
    <tns:GetWeatherResponse>
      <tns:city>San Francisco</tns:city>
      <tns:temperature>72</tns:temperature>
      <tns:unit>F</tns:unit>
      <tns:condition>Sunny</tns:condition>
      <tns:humidity>45</tns:humidity>
    </tns:GetWeatherResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'WeatherService',
        operation: 'GetForecast',
        soapAction: 'http://weather.daakia.dev/GetForecast',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://weather.daakia.dev/">
  <soap:Body>
    <tns:GetForecastResponse>
      <tns:forecast>
        <tns:day date="2026-01-01">
          <tns:high>75</tns:high>
          <tns:low>58</tns:low>
          <tns:condition>Partly Cloudy</tns:condition>
        </tns:day>
        <tns:day date="2026-01-02">
          <tns:high>70</tns:high>
          <tns:low>55</tns:low>
          <tns:condition>Rainy</tns:condition>
        </tns:day>
      </tns:forecast>
    </tns:GetForecastResponse>
  </soap:Body>
</soap:Envelope>`,
      },
    ],
  },
  {
    id: 'user-management',
    label: 'User Management',
    description: 'CRUD operations for user accounts',
    operations: [
      {
        service: 'UserService',
        operation: 'GetUser',
        soapAction: 'http://users.daakia.dev/GetUser',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://users.daakia.dev/">
  <soap:Body>
    <tns:GetUserResponse>
      <tns:user>
        <tns:id>1001</tns:id>
        <tns:username>john.doe</tns:username>
        <tns:email>john@example.com</tns:email>
        <tns:role>admin</tns:role>
        <tns:active>true</tns:active>
      </tns:user>
    </tns:GetUserResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'UserService',
        operation: 'CreateUser',
        soapAction: 'http://users.daakia.dev/CreateUser',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://users.daakia.dev/">
  <soap:Body>
    <tns:CreateUserResponse>
      <tns:userId>1002</tns:userId>
      <tns:success>true</tns:success>
    </tns:CreateUserResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'UserService',
        operation: 'DeleteUser',
        soapAction: 'http://users.daakia.dev/DeleteUser',
        responseType: 'fault',
        response: '',
        faultCode: 'soap:Client',
        faultString: 'User not found: insufficient permissions to delete',
      },
    ],
  },

  // ─── WSDL-Only Samples ─────────────────────────────────────────────

  {
    id: 'payment-gateway',
    label: 'Payment Gateway',
    description: 'Credit card authorization, capture, and refund',
    operations: [
      {
        service: 'PaymentGatewayService',
        operation: 'Authorize',
        soapAction: 'http://payment.example.com/gateway/Authorize',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://payment.example.com/gateway">
  <soap:Body>
    <tns:AuthorizeResponse>
      <tns:authorizationCode>AUTH-7829-XK</tns:authorizationCode>
      <tns:transactionId>TXN-20260529-001</tns:transactionId>
      <tns:status>APPROVED</tns:status>
      <tns:message>Card authorized successfully</tns:message>
    </tns:AuthorizeResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'PaymentGatewayService',
        operation: 'Capture',
        soapAction: 'http://payment.example.com/gateway/Capture',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://payment.example.com/gateway">
  <soap:Body>
    <tns:CaptureResponse>
      <tns:captureId>CAP-20260529-001</tns:captureId>
      <tns:status>SETTLED</tns:status>
      <tns:settledAmount>149.99</tns:settledAmount>
    </tns:CaptureResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'PaymentGatewayService',
        operation: 'Refund',
        soapAction: 'http://payment.example.com/gateway/Refund',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://payment.example.com/gateway">
  <soap:Body>
    <tns:RefundResponse>
      <tns:refundId>RFD-20260529-001</tns:refundId>
      <tns:status>PROCESSED</tns:status>
      <tns:refundedAmount>49.99</tns:refundedAmount>
    </tns:RefundResponse>
  </soap:Body>
</soap:Envelope>`,
      },
    ],
  },
  {
    id: 'shipping-tracker',
    label: 'Shipping Tracker',
    description: 'Package tracking and shipping rate estimation',
    operations: [
      {
        service: 'ShippingTrackerService',
        operation: 'TrackPackage',
        soapAction: 'http://shipping.example.com/tracker/TrackPackage',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://shipping.example.com/tracker">
  <soap:Body>
    <tns:TrackPackageResponse>
      <tns:status>In Transit</tns:status>
      <tns:location>Memphis, TN Distribution Center</tns:location>
      <tns:estimatedDelivery>2026-06-02</tns:estimatedDelivery>
      <tns:lastUpdate>2026-05-29T14:30:00Z</tns:lastUpdate>
    </tns:TrackPackageResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'ShippingTrackerService',
        operation: 'GetRate',
        soapAction: 'http://shipping.example.com/tracker/GetRate',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://shipping.example.com/tracker">
  <soap:Body>
    <tns:GetRateResponse>
      <tns:rate>12.50</tns:rate>
      <tns:currency>USD</tns:currency>
      <tns:transitDays>3</tns:transitDays>
    </tns:GetRateResponse>
  </soap:Body>
</soap:Envelope>`,
      },
    ],
  },
  {
    id: 'notification-hub',
    label: 'Notification Hub',
    description: 'Email, SMS, and push notification dispatch',
    operations: [
      {
        service: 'NotificationHubService',
        operation: 'SendEmail',
        soapAction: 'http://notification.example.com/hub/SendEmail',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://notification.example.com/hub">
  <soap:Body>
    <tns:SendEmailResponse>
      <tns:messageId>MSG-EM-20260529-001</tns:messageId>
      <tns:status>QUEUED</tns:status>
    </tns:SendEmailResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'NotificationHubService',
        operation: 'SendSms',
        soapAction: 'http://notification.example.com/hub/SendSms',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://notification.example.com/hub">
  <soap:Body>
    <tns:SendSmsResponse>
      <tns:messageId>MSG-SM-20260529-001</tns:messageId>
      <tns:status>SENT</tns:status>
      <tns:segmentCount>1</tns:segmentCount>
    </tns:SendSmsResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'NotificationHubService',
        operation: 'SendPush',
        soapAction: 'http://notification.example.com/hub/SendPush',
        responseType: 'fault',
        response: '',
        faultCode: 'soap:Client',
        faultString: 'Invalid device token: token expired or unregistered',
      },
    ],
  },
  {
    id: 'inventory-management',
    label: 'Inventory Management',
    description: 'Stock levels and reorder triggers',
    operations: [
      {
        service: 'InventoryService',
        operation: 'GetStock',
        soapAction: 'http://inventory.example.com/management/GetStock',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://inventory.example.com/management">
  <soap:Body>
    <tns:GetStockResponse>
      <tns:sku>SKU-WIDGET-001</tns:sku>
      <tns:quantity>2450</tns:quantity>
      <tns:reserved>180</tns:reserved>
      <tns:available>2270</tns:available>
      <tns:warehouse>US-WEST-01</tns:warehouse>
    </tns:GetStockResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'InventoryService',
        operation: 'Reorder',
        soapAction: 'http://inventory.example.com/management/Reorder',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://inventory.example.com/management">
  <soap:Body>
    <tns:ReorderResponse>
      <tns:orderId>PO-20260529-001</tns:orderId>
      <tns:estimatedArrival>2026-06-05</tns:estimatedArrival>
      <tns:status>CONFIRMED</tns:status>
    </tns:ReorderResponse>
  </soap:Body>
</soap:Envelope>`,
      },
    ],
  },
  {
    id: 'crm-customer',
    label: 'CRM Customer',
    description: 'Customer lookup, create, and search',
    operations: [
      {
        service: 'CrmCustomerService',
        operation: 'GetCustomer',
        soapAction: 'http://crm.example.com/customer/GetCustomer',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://crm.example.com/customer">
  <soap:Body>
    <tns:GetCustomerResponse>
      <tns:customerId>CUST-10042</tns:customerId>
      <tns:firstName>Sarah</tns:firstName>
      <tns:lastName>Mitchell</tns:lastName>
      <tns:email>sarah.mitchell@example.com</tns:email>
      <tns:phone>+1-555-0142</tns:phone>
      <tns:tier>Gold</tns:tier>
      <tns:createdDate>2024-03-15</tns:createdDate>
    </tns:GetCustomerResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'CrmCustomerService',
        operation: 'CreateCustomer',
        soapAction: 'http://crm.example.com/customer/CreateCustomer',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://crm.example.com/customer">
  <soap:Body>
    <tns:CreateCustomerResponse>
      <tns:customerId>CUST-10043</tns:customerId>
      <tns:status>CREATED</tns:status>
    </tns:CreateCustomerResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'CrmCustomerService',
        operation: 'SearchCustomer',
        soapAction: 'http://crm.example.com/customer/SearchCustomer',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://crm.example.com/customer">
  <soap:Body>
    <tns:SearchCustomerResponse>
      <tns:totalCount>3</tns:totalCount>
      <tns:results>[CUST-10042, CUST-10025, CUST-10018]</tns:results>
    </tns:SearchCustomerResponse>
  </soap:Body>
</soap:Envelope>`,
      },
    ],
  },

  // ─── WSDL + XSD Samples ─────────────────────────────────────────────

  {
    id: 'healthcare-patient',
    label: 'Healthcare Patient (WSDL+XSD)',
    description: 'Patient registry with complex type schema (admission, discharge)',
    hasXsd: true,
    operations: [
      {
        service: 'HealthcarePatientService',
        operation: 'GetPatient',
        soapAction: 'http://healthcare.example.com/patient/GetPatient',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://healthcare.example.com/patient">
  <soap:Body>
    <tns:GetPatientResult>
      <tns:patientId>PAT-900123</tns:patientId>
      <tns:firstName>Robert</tns:firstName>
      <tns:lastName>Chen</tns:lastName>
      <tns:dateOfBirth>1985-07-14</tns:dateOfBirth>
      <tns:gender>Male</tns:gender>
      <tns:bloodType>A+</tns:bloodType>
      <tns:insuranceId>INS-BC-5500123</tns:insuranceId>
    </tns:GetPatientResult>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'HealthcarePatientService',
        operation: 'AdmitPatient',
        soapAction: 'http://healthcare.example.com/patient/AdmitPatient',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://healthcare.example.com/patient">
  <soap:Body>
    <tns:AdmitPatientResult>
      <tns:admissionId>ADM-20260529-001</tns:admissionId>
      <tns:room>4B</tns:room>
      <tns:bed>2</tns:bed>
      <tns:admissionDate>2026-05-29T10:30:00Z</tns:admissionDate>
      <tns:status>ADMITTED</tns:status>
    </tns:AdmitPatientResult>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'HealthcarePatientService',
        operation: 'DischargePatient',
        soapAction: 'http://healthcare.example.com/patient/DischargePatient',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://healthcare.example.com/patient">
  <soap:Body>
    <tns:DischargePatientResult>
      <tns:dischargeId>DIS-20260529-001</tns:dischargeId>
      <tns:dischargeDate>2026-05-29T16:00:00Z</tns:dischargeDate>
      <tns:status>DISCHARGED</tns:status>
    </tns:DischargePatientResult>
  </soap:Body>
</soap:Envelope>`,
      },
    ],
  },
  {
    id: 'ecommerce-order',
    label: 'E-Commerce Order (WSDL+XSD)',
    description: 'Order placement, status, and cancellation with complex types',
    hasXsd: true,
    operations: [
      {
        service: 'ECommerceOrderService',
        operation: 'PlaceOrder',
        soapAction: 'http://ecommerce.example.com/order/PlaceOrder',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://ecommerce.example.com/order">
  <soap:Body>
    <tns:PlaceOrderResult>
      <tns:orderId>ORD-20260529-5582</tns:orderId>
      <tns:total>234.97</tns:total>
      <tns:tax>18.80</tns:tax>
      <tns:shipping>9.99</tns:shipping>
      <tns:estimatedDelivery>2026-06-03</tns:estimatedDelivery>
      <tns:status>CONFIRMED</tns:status>
    </tns:PlaceOrderResult>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'ECommerceOrderService',
        operation: 'GetOrderStatus',
        soapAction: 'http://ecommerce.example.com/order/GetOrderStatus',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://ecommerce.example.com/order">
  <soap:Body>
    <tns:GetOrderStatusResult>
      <tns:orderId>ORD-20260529-5582</tns:orderId>
      <tns:status>SHIPPED</tns:status>
      <tns:trackingNumber>1Z999AA10123456784</tns:trackingNumber>
      <tns:lastUpdated>2026-05-30T08:15:00Z</tns:lastUpdated>
    </tns:GetOrderStatusResult>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'ECommerceOrderService',
        operation: 'CancelOrder',
        soapAction: 'http://ecommerce.example.com/order/CancelOrder',
        responseType: 'fault',
        response: '',
        faultCode: 'soap:Server',
        faultString: 'Order already shipped — cannot cancel',
      },
    ],
  },
  {
    id: 'banking-account',
    label: 'Banking Account (WSDL+XSD)',
    description: 'Balance inquiry, transfer, and transaction history',
    hasXsd: true,
    operations: [
      {
        service: 'BankingAccountService',
        operation: 'GetBalance',
        soapAction: 'http://banking.example.com/account/GetBalance',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://banking.example.com/account">
  <soap:Body>
    <tns:GetBalanceResult>
      <tns:accountNumber>****4521</tns:accountNumber>
      <tns:availableBalance>15230.50</tns:availableBalance>
      <tns:currentBalance>15430.50</tns:currentBalance>
      <tns:currency>USD</tns:currency>
      <tns:lastTransactionDate>2026-05-28T19:45:00Z</tns:lastTransactionDate>
    </tns:GetBalanceResult>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'BankingAccountService',
        operation: 'Transfer',
        soapAction: 'http://banking.example.com/account/Transfer',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://banking.example.com/account">
  <soap:Body>
    <tns:TransferResult>
      <tns:transactionId>TRF-20260529-7891</tns:transactionId>
      <tns:status>COMPLETED</tns:status>
      <tns:newBalance>14730.50</tns:newBalance>
      <tns:timestamp>2026-05-29T10:00:00Z</tns:timestamp>
    </tns:TransferResult>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'BankingAccountService',
        operation: 'GetTransactions',
        soapAction: 'http://banking.example.com/account/GetTransactions',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://banking.example.com/account">
  <soap:Body>
    <tns:GetTransactionsResult>
      <tns:accountNumber>****4521</tns:accountNumber>
      <tns:totalCount>2</tns:totalCount>
      <tns:transactions>
        <tns:transaction>
          <tns:transactionId>TRF-20260528-4455</tns:transactionId>
          <tns:date>2026-05-28T19:45:00Z</tns:date>
          <tns:type>DEBIT</tns:type>
          <tns:amount>-85.00</tns:amount>
          <tns:description>Online Purchase</tns:description>
        </tns:transaction>
      </tns:transactions>
    </tns:GetTransactionsResult>
  </soap:Body>
</soap:Envelope>`,
      },
    ],
  },
  {
    id: 'hr-employee',
    label: 'HR Employee (WSDL+XSD)',
    description: 'Employee directory, leave requests, payslip lookup',
    hasXsd: true,
    operations: [
      {
        service: 'HrEmployeeService',
        operation: 'GetEmployee',
        soapAction: 'http://hr.example.com/employee/GetEmployee',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://hr.example.com/employee">
  <soap:Body>
    <tns:GetEmployeeResult>
      <tns:employeeId>EMP-2001</tns:employeeId>
      <tns:firstName>Priya</tns:firstName>
      <tns:lastName>Sharma</tns:lastName>
      <tns:email>priya.sharma@example.com</tns:email>
      <tns:department>Engineering</tns:department>
      <tns:title>Senior Software Engineer</tns:title>
      <tns:manager>VP Engineering</tns:manager>
      <tns:hireDate>2022-08-01</tns:hireDate>
      <tns:location>Bangalore</tns:location>
    </tns:GetEmployeeResult>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'HrEmployeeService',
        operation: 'RequestLeave',
        soapAction: 'http://hr.example.com/employee/RequestLeave',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://hr.example.com/employee">
  <soap:Body>
    <tns:RequestLeaveResult>
      <tns:requestId>LR-20260529-001</tns:requestId>
      <tns:status>APPROVED</tns:status>
      <tns:remainingBalance>12</tns:remainingBalance>
      <tns:approver>VP Engineering</tns:approver>
    </tns:RequestLeaveResult>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'HrEmployeeService',
        operation: 'GetPayslip',
        soapAction: 'http://hr.example.com/employee/GetPayslip',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://hr.example.com/employee">
  <soap:Body>
    <tns:GetPayslipResult>
      <tns:employeeId>EMP-2001</tns:employeeId>
      <tns:period>May 2026</tns:period>
      <tns:grossPay>12500.00</tns:grossPay>
      <tns:deductions>3750.00</tns:deductions>
      <tns:netPay>8750.00</tns:netPay>
      <tns:payDate>2026-05-31</tns:payDate>
    </tns:GetPayslipResult>
  </soap:Body>
</soap:Envelope>`,
      },
    ],
  },
  {
    id: 'insurance-claims',
    label: 'Insurance Claims (WSDL+XSD)',
    description: 'Claim submission, status check, and appeal',
    hasXsd: true,
    operations: [
      {
        service: 'InsuranceClaimsService',
        operation: 'SubmitClaim',
        soapAction: 'http://insurance.example.com/claims/SubmitClaim',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://insurance.example.com/claims">
  <soap:Body>
    <tns:SubmitClaimResult>
      <tns:claimId>CLM-20260529-001</tns:claimId>
      <tns:referenceNumber>REF-IN-88452</tns:referenceNumber>
      <tns:status>SUBMITTED</tns:status>
      <tns:submittedDate>2026-05-29T09:00:00Z</tns:submittedDate>
      <tns:estimatedProcessingDays>14</tns:estimatedProcessingDays>
    </tns:SubmitClaimResult>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'InsuranceClaimsService',
        operation: 'GetClaimStatus',
        soapAction: 'http://insurance.example.com/claims/GetClaimStatus',
        responseType: 'static',
        response: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://insurance.example.com/claims">
  <soap:Body>
    <tns:GetClaimStatusResult>
      <tns:claimId>CLM-20260529-001</tns:claimId>
      <tns:status>UNDER_REVIEW</tns:status>
      <tns:lastUpdated>2026-05-29T14:00:00Z</tns:lastUpdated>
    </tns:GetClaimStatusResult>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        service: 'InsuranceClaimsService',
        operation: 'AppealClaim',
        soapAction: 'http://insurance.example.com/claims/AppealClaim',
        responseType: 'fault',
        response: '',
        faultCode: 'soap:Client',
        faultString: 'Claim CLM-20260529-001 is still under initial review — appeals not available yet',
      },
    ],
  },
];
