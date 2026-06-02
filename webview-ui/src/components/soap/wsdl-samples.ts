/**
 * Sample WSDL and XSD files for download.
 * Users can download these to test SOAP client / WSDL import functionality.
 */

export interface WsdlSample {
  id: string;
  label: string;
  filename: string;
  description: string;
  content: string;
  type: 'wsdl' | 'xsd';
}

export const WSDL_SAMPLES: WsdlSample[] = [
  // ─── WSDL-Only Samples ─────────────────────────────────────────────
  {
    id: 'payment-gateway',
    label: 'Payment Gateway',
    filename: 'PaymentGateway.wsdl',
    description: 'Credit card processing with authorization and capture',
    type: 'wsdl',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://payment.example.com/gateway"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://payment.example.com/gateway"
  name="PaymentGatewayService">

  <types>
    <xsd:schema targetNamespace="http://payment.example.com/gateway">
      <xsd:element name="AuthorizeRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="cardNumber" type="xsd:string"/>
            <xsd:element name="expiryMonth" type="xsd:int"/>
            <xsd:element name="expiryYear" type="xsd:int"/>
            <xsd:element name="cvv" type="xsd:string"/>
            <xsd:element name="amount" type="xsd:decimal"/>
            <xsd:element name="currency" type="xsd:string"/>
            <xsd:element name="merchantId" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="AuthorizeResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="authorizationCode" type="xsd:string"/>
            <xsd:element name="transactionId" type="xsd:string"/>
            <xsd:element name="status" type="xsd:string"/>
            <xsd:element name="message" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="CaptureRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="transactionId" type="xsd:string"/>
            <xsd:element name="amount" type="xsd:decimal"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="CaptureResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="captureId" type="xsd:string"/>
            <xsd:element name="status" type="xsd:string"/>
            <xsd:element name="settledAmount" type="xsd:decimal"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="RefundRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="transactionId" type="xsd:string"/>
            <xsd:element name="amount" type="xsd:decimal"/>
            <xsd:element name="reason" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="RefundResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="refundId" type="xsd:string"/>
            <xsd:element name="status" type="xsd:string"/>
            <xsd:element name="refundedAmount" type="xsd:decimal"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </types>

  <message name="AuthorizeInput"><part name="parameters" element="tns:AuthorizeRequest"/></message>
  <message name="AuthorizeOutput"><part name="parameters" element="tns:AuthorizeResponse"/></message>
  <message name="CaptureInput"><part name="parameters" element="tns:CaptureRequest"/></message>
  <message name="CaptureOutput"><part name="parameters" element="tns:CaptureResponse"/></message>
  <message name="RefundInput"><part name="parameters" element="tns:RefundRequest"/></message>
  <message name="RefundOutput"><part name="parameters" element="tns:RefundResponse"/></message>

  <portType name="PaymentGatewayPortType">
    <operation name="Authorize">
      <input message="tns:AuthorizeInput"/>
      <output message="tns:AuthorizeOutput"/>
    </operation>
    <operation name="Capture">
      <input message="tns:CaptureInput"/>
      <output message="tns:CaptureOutput"/>
    </operation>
    <operation name="Refund">
      <input message="tns:RefundInput"/>
      <output message="tns:RefundOutput"/>
    </operation>
  </portType>

  <binding name="PaymentGatewayBinding" type="tns:PaymentGatewayPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="Authorize">
      <soap:operation soapAction="http://payment.example.com/gateway/Authorize"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="Capture">
      <soap:operation soapAction="http://payment.example.com/gateway/Capture"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="Refund">
      <soap:operation soapAction="http://payment.example.com/gateway/Refund"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="PaymentGatewayService">
    <port name="PaymentGatewayPort" binding="tns:PaymentGatewayBinding">
      <soap:address location="http://localhost:8080/services/PaymentGateway"/>
    </port>
  </service>
</definitions>`,
  },
  {
    id: 'shipping-tracker',
    label: 'Shipping Tracker',
    filename: 'ShippingTracker.wsdl',
    description: 'Package tracking, rate estimation, and label generation',
    type: 'wsdl',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://shipping.example.com/tracker"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://shipping.example.com/tracker"
  name="ShippingTrackerService">

  <types>
    <xsd:schema targetNamespace="http://shipping.example.com/tracker">
      <xsd:element name="TrackPackageRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="trackingNumber" type="xsd:string"/>
            <xsd:element name="carrier" type="xsd:string" minOccurs="0"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="TrackPackageResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="status" type="xsd:string"/>
            <xsd:element name="location" type="xsd:string"/>
            <xsd:element name="estimatedDelivery" type="xsd:date"/>
            <xsd:element name="lastUpdate" type="xsd:dateTime"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="GetRateRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="originZip" type="xsd:string"/>
            <xsd:element name="destZip" type="xsd:string"/>
            <xsd:element name="weightLbs" type="xsd:decimal"/>
            <xsd:element name="serviceType" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="GetRateResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="rate" type="xsd:decimal"/>
            <xsd:element name="currency" type="xsd:string"/>
            <xsd:element name="transitDays" type="xsd:int"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </types>

  <message name="TrackInput"><part name="parameters" element="tns:TrackPackageRequest"/></message>
  <message name="TrackOutput"><part name="parameters" element="tns:TrackPackageResponse"/></message>
  <message name="RateInput"><part name="parameters" element="tns:GetRateRequest"/></message>
  <message name="RateOutput"><part name="parameters" element="tns:GetRateResponse"/></message>

  <portType name="ShippingTrackerPortType">
    <operation name="TrackPackage">
      <input message="tns:TrackInput"/>
      <output message="tns:TrackOutput"/>
    </operation>
    <operation name="GetRate">
      <input message="tns:RateInput"/>
      <output message="tns:RateOutput"/>
    </operation>
  </portType>

  <binding name="ShippingTrackerBinding" type="tns:ShippingTrackerPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="TrackPackage">
      <soap:operation soapAction="http://shipping.example.com/tracker/TrackPackage"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="GetRate">
      <soap:operation soapAction="http://shipping.example.com/tracker/GetRate"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="ShippingTrackerService">
    <port name="ShippingTrackerPort" binding="tns:ShippingTrackerBinding">
      <soap:address location="http://localhost:8080/services/ShippingTracker"/>
    </port>
  </service>
</definitions>`,
  },
  {
    id: 'notification-hub',
    label: 'Notification Hub',
    filename: 'NotificationHub.wsdl',
    description: 'Email, SMS, and push notification dispatch service',
    type: 'wsdl',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://notification.example.com/hub"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://notification.example.com/hub"
  name="NotificationHubService">

  <types>
    <xsd:schema targetNamespace="http://notification.example.com/hub">
      <xsd:element name="SendEmailRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="to" type="xsd:string"/>
            <xsd:element name="subject" type="xsd:string"/>
            <xsd:element name="body" type="xsd:string"/>
            <xsd:element name="isHtml" type="xsd:boolean"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="SendEmailResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="messageId" type="xsd:string"/>
            <xsd:element name="status" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="SendSmsRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="phoneNumber" type="xsd:string"/>
            <xsd:element name="message" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="SendSmsResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="messageId" type="xsd:string"/>
            <xsd:element name="status" type="xsd:string"/>
            <xsd:element name="segmentCount" type="xsd:int"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="SendPushRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="deviceToken" type="xsd:string"/>
            <xsd:element name="title" type="xsd:string"/>
            <xsd:element name="body" type="xsd:string"/>
            <xsd:element name="data" type="xsd:string" minOccurs="0"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="SendPushResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="notificationId" type="xsd:string"/>
            <xsd:element name="delivered" type="xsd:boolean"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </types>

  <message name="EmailIn"><part name="parameters" element="tns:SendEmailRequest"/></message>
  <message name="EmailOut"><part name="parameters" element="tns:SendEmailResponse"/></message>
  <message name="SmsIn"><part name="parameters" element="tns:SendSmsRequest"/></message>
  <message name="SmsOut"><part name="parameters" element="tns:SendSmsResponse"/></message>
  <message name="PushIn"><part name="parameters" element="tns:SendPushRequest"/></message>
  <message name="PushOut"><part name="parameters" element="tns:SendPushResponse"/></message>

  <portType name="NotificationHubPortType">
    <operation name="SendEmail">
      <input message="tns:EmailIn"/>
      <output message="tns:EmailOut"/>
    </operation>
    <operation name="SendSms">
      <input message="tns:SmsIn"/>
      <output message="tns:SmsOut"/>
    </operation>
    <operation name="SendPush">
      <input message="tns:PushIn"/>
      <output message="tns:PushOut"/>
    </operation>
  </portType>

  <binding name="NotificationHubBinding" type="tns:NotificationHubPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="SendEmail">
      <soap:operation soapAction="http://notification.example.com/hub/SendEmail"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="SendSms">
      <soap:operation soapAction="http://notification.example.com/hub/SendSms"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="SendPush">
      <soap:operation soapAction="http://notification.example.com/hub/SendPush"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="NotificationHubService">
    <port name="NotificationHubPort" binding="tns:NotificationHubBinding">
      <soap:address location="http://localhost:8080/services/NotificationHub"/>
    </port>
  </service>
</definitions>`,
  },
  {
    id: 'inventory-management',
    label: 'Inventory Management',
    filename: 'InventoryManagement.wsdl',
    description: 'Stock levels, warehouse lookup, and reorder triggers',
    type: 'wsdl',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://inventory.example.com/management"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://inventory.example.com/management"
  name="InventoryManagementService">

  <types>
    <xsd:schema targetNamespace="http://inventory.example.com/management">
      <xsd:element name="GetStockRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="sku" type="xsd:string"/>
            <xsd:element name="warehouseId" type="xsd:string" minOccurs="0"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="GetStockResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="sku" type="xsd:string"/>
            <xsd:element name="quantity" type="xsd:int"/>
            <xsd:element name="reserved" type="xsd:int"/>
            <xsd:element name="available" type="xsd:int"/>
            <xsd:element name="warehouse" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="ReorderRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="sku" type="xsd:string"/>
            <xsd:element name="quantity" type="xsd:int"/>
            <xsd:element name="priority" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="ReorderResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="orderId" type="xsd:string"/>
            <xsd:element name="estimatedArrival" type="xsd:date"/>
            <xsd:element name="status" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </types>

  <message name="StockIn"><part name="parameters" element="tns:GetStockRequest"/></message>
  <message name="StockOut"><part name="parameters" element="tns:GetStockResponse"/></message>
  <message name="ReorderIn"><part name="parameters" element="tns:ReorderRequest"/></message>
  <message name="ReorderOut"><part name="parameters" element="tns:ReorderResponse"/></message>

  <portType name="InventoryPortType">
    <operation name="GetStock">
      <input message="tns:StockIn"/>
      <output message="tns:StockOut"/>
    </operation>
    <operation name="Reorder">
      <input message="tns:ReorderIn"/>
      <output message="tns:ReorderOut"/>
    </operation>
  </portType>

  <binding name="InventoryBinding" type="tns:InventoryPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="GetStock">
      <soap:operation soapAction="http://inventory.example.com/management/GetStock"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="Reorder">
      <soap:operation soapAction="http://inventory.example.com/management/Reorder"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="InventoryManagementService">
    <port name="InventoryPort" binding="tns:InventoryBinding">
      <soap:address location="http://localhost:8080/services/InventoryManagement"/>
    </port>
  </service>
</definitions>`,
  },
  {
    id: 'crm-customer',
    label: 'CRM Customer Service',
    filename: 'CrmCustomer.wsdl',
    description: 'Customer lookup, create, update for CRM integration',
    type: 'wsdl',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://crm.example.com/customer"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://crm.example.com/customer"
  name="CrmCustomerService">

  <types>
    <xsd:schema targetNamespace="http://crm.example.com/customer">
      <xsd:element name="GetCustomerRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="customerId" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="GetCustomerResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="customerId" type="xsd:string"/>
            <xsd:element name="firstName" type="xsd:string"/>
            <xsd:element name="lastName" type="xsd:string"/>
            <xsd:element name="email" type="xsd:string"/>
            <xsd:element name="phone" type="xsd:string"/>
            <xsd:element name="tier" type="xsd:string"/>
            <xsd:element name="createdDate" type="xsd:date"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="CreateCustomerRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="firstName" type="xsd:string"/>
            <xsd:element name="lastName" type="xsd:string"/>
            <xsd:element name="email" type="xsd:string"/>
            <xsd:element name="phone" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="CreateCustomerResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="customerId" type="xsd:string"/>
            <xsd:element name="status" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="SearchCustomerRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="query" type="xsd:string"/>
            <xsd:element name="maxResults" type="xsd:int"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="SearchCustomerResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="totalCount" type="xsd:int"/>
            <xsd:element name="results" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </types>

  <message name="GetIn"><part name="parameters" element="tns:GetCustomerRequest"/></message>
  <message name="GetOut"><part name="parameters" element="tns:GetCustomerResponse"/></message>
  <message name="CreateIn"><part name="parameters" element="tns:CreateCustomerRequest"/></message>
  <message name="CreateOut"><part name="parameters" element="tns:CreateCustomerResponse"/></message>
  <message name="SearchIn"><part name="parameters" element="tns:SearchCustomerRequest"/></message>
  <message name="SearchOut"><part name="parameters" element="tns:SearchCustomerResponse"/></message>

  <portType name="CrmCustomerPortType">
    <operation name="GetCustomer">
      <input message="tns:GetIn"/>
      <output message="tns:GetOut"/>
    </operation>
    <operation name="CreateCustomer">
      <input message="tns:CreateIn"/>
      <output message="tns:CreateOut"/>
    </operation>
    <operation name="SearchCustomer">
      <input message="tns:SearchIn"/>
      <output message="tns:SearchOut"/>
    </operation>
  </portType>

  <binding name="CrmCustomerBinding" type="tns:CrmCustomerPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="GetCustomer">
      <soap:operation soapAction="http://crm.example.com/customer/GetCustomer"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="CreateCustomer">
      <soap:operation soapAction="http://crm.example.com/customer/CreateCustomer"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="SearchCustomer">
      <soap:operation soapAction="http://crm.example.com/customer/SearchCustomer"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="CrmCustomerService">
    <port name="CrmCustomerPort" binding="tns:CrmCustomerBinding">
      <soap:address location="http://localhost:8080/services/CrmCustomer"/>
    </port>
  </service>
</definitions>`,
  },

  // ─── WSDL + XSD Samples ─────────────────────────────────────────────
  {
    id: 'healthcare-patient-wsdl',
    label: 'Healthcare Patient (WSDL)',
    filename: 'HealthcarePatient.wsdl',
    description: 'Patient registry with external XSD schema import',
    type: 'wsdl',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://healthcare.example.com/patient"
  xmlns:pat="http://healthcare.example.com/patient/types"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://healthcare.example.com/patient"
  name="HealthcarePatientService">

  <types>
    <xsd:schema targetNamespace="http://healthcare.example.com/patient"
      xmlns:pat="http://healthcare.example.com/patient/types">
      <xsd:import namespace="http://healthcare.example.com/patient/types"
        schemaLocation="HealthcarePatient.xsd"/>
      <xsd:element name="GetPatient" type="pat:GetPatientRequest"/>
      <xsd:element name="GetPatientResult" type="pat:PatientRecord"/>
      <xsd:element name="AdmitPatient" type="pat:AdmitPatientRequest"/>
      <xsd:element name="AdmitPatientResult" type="pat:AdmissionConfirmation"/>
      <xsd:element name="DischargePatient" type="pat:DischargePatientRequest"/>
      <xsd:element name="DischargePatientResult" type="pat:DischargeConfirmation"/>
    </xsd:schema>
  </types>

  <message name="GetPatientIn"><part name="parameters" element="tns:GetPatient"/></message>
  <message name="GetPatientOut"><part name="parameters" element="tns:GetPatientResult"/></message>
  <message name="AdmitIn"><part name="parameters" element="tns:AdmitPatient"/></message>
  <message name="AdmitOut"><part name="parameters" element="tns:AdmitPatientResult"/></message>
  <message name="DischargeIn"><part name="parameters" element="tns:DischargePatient"/></message>
  <message name="DischargeOut"><part name="parameters" element="tns:DischargePatientResult"/></message>

  <portType name="PatientServicePortType">
    <operation name="GetPatient">
      <input message="tns:GetPatientIn"/>
      <output message="tns:GetPatientOut"/>
    </operation>
    <operation name="AdmitPatient">
      <input message="tns:AdmitIn"/>
      <output message="tns:AdmitOut"/>
    </operation>
    <operation name="DischargePatient">
      <input message="tns:DischargeIn"/>
      <output message="tns:DischargeOut"/>
    </operation>
  </portType>

  <binding name="PatientServiceBinding" type="tns:PatientServicePortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="GetPatient">
      <soap:operation soapAction="http://healthcare.example.com/patient/GetPatient"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="AdmitPatient">
      <soap:operation soapAction="http://healthcare.example.com/patient/AdmitPatient"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="DischargePatient">
      <soap:operation soapAction="http://healthcare.example.com/patient/DischargePatient"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="HealthcarePatientService">
    <port name="PatientServicePort" binding="tns:PatientServiceBinding">
      <soap:address location="http://localhost:8080/services/HealthcarePatient"/>
    </port>
  </service>
</definitions>`,
  },
  {
    id: 'healthcare-patient-xsd',
    label: 'Healthcare Patient (XSD)',
    filename: 'HealthcarePatient.xsd',
    description: 'Complex types for patient, admission, and discharge',
    type: 'xsd',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:tns="http://healthcare.example.com/patient/types"
  targetNamespace="http://healthcare.example.com/patient/types"
  elementFormDefault="qualified">

  <xsd:complexType name="Address">
    <xsd:sequence>
      <xsd:element name="street" type="xsd:string"/>
      <xsd:element name="city" type="xsd:string"/>
      <xsd:element name="state" type="xsd:string"/>
      <xsd:element name="zipCode" type="xsd:string"/>
      <xsd:element name="country" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="GetPatientRequest">
    <xsd:sequence>
      <xsd:element name="patientId" type="xsd:string"/>
      <xsd:element name="includeHistory" type="xsd:boolean" minOccurs="0"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="PatientRecord">
    <xsd:sequence>
      <xsd:element name="patientId" type="xsd:string"/>
      <xsd:element name="firstName" type="xsd:string"/>
      <xsd:element name="lastName" type="xsd:string"/>
      <xsd:element name="dateOfBirth" type="xsd:date"/>
      <xsd:element name="gender" type="xsd:string"/>
      <xsd:element name="bloodType" type="xsd:string"/>
      <xsd:element name="address" type="tns:Address"/>
      <xsd:element name="insuranceId" type="xsd:string"/>
      <xsd:element name="allergies" type="xsd:string" minOccurs="0" maxOccurs="unbounded"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="AdmitPatientRequest">
    <xsd:sequence>
      <xsd:element name="patientId" type="xsd:string"/>
      <xsd:element name="department" type="xsd:string"/>
      <xsd:element name="admittingPhysician" type="xsd:string"/>
      <xsd:element name="reason" type="xsd:string"/>
      <xsd:element name="priority" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="AdmissionConfirmation">
    <xsd:sequence>
      <xsd:element name="admissionId" type="xsd:string"/>
      <xsd:element name="room" type="xsd:string"/>
      <xsd:element name="bed" type="xsd:string"/>
      <xsd:element name="admissionDate" type="xsd:dateTime"/>
      <xsd:element name="status" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="DischargePatientRequest">
    <xsd:sequence>
      <xsd:element name="admissionId" type="xsd:string"/>
      <xsd:element name="dischargeSummary" type="xsd:string"/>
      <xsd:element name="followUpInstructions" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="DischargeConfirmation">
    <xsd:sequence>
      <xsd:element name="dischargeId" type="xsd:string"/>
      <xsd:element name="dischargeDate" type="xsd:dateTime"/>
      <xsd:element name="status" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>
</xsd:schema>`,
  },
  {
    id: 'ecommerce-order-wsdl',
    label: 'E-Commerce Order (WSDL)',
    filename: 'ECommerceOrder.wsdl',
    description: 'Order placement, status check, and cancellation with XSD types',
    type: 'wsdl',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://ecommerce.example.com/order"
  xmlns:ord="http://ecommerce.example.com/order/types"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://ecommerce.example.com/order"
  name="ECommerceOrderService">

  <types>
    <xsd:schema targetNamespace="http://ecommerce.example.com/order">
      <xsd:import namespace="http://ecommerce.example.com/order/types"
        schemaLocation="ECommerceOrder.xsd"/>
      <xsd:element name="PlaceOrder" type="ord:PlaceOrderRequest"/>
      <xsd:element name="PlaceOrderResult" type="ord:OrderConfirmation"/>
      <xsd:element name="GetOrderStatus" type="ord:GetOrderStatusRequest"/>
      <xsd:element name="GetOrderStatusResult" type="ord:OrderStatus"/>
      <xsd:element name="CancelOrder" type="ord:CancelOrderRequest"/>
      <xsd:element name="CancelOrderResult" type="ord:CancelConfirmation"/>
    </xsd:schema>
  </types>

  <message name="PlaceIn"><part name="parameters" element="tns:PlaceOrder"/></message>
  <message name="PlaceOut"><part name="parameters" element="tns:PlaceOrderResult"/></message>
  <message name="StatusIn"><part name="parameters" element="tns:GetOrderStatus"/></message>
  <message name="StatusOut"><part name="parameters" element="tns:GetOrderStatusResult"/></message>
  <message name="CancelIn"><part name="parameters" element="tns:CancelOrder"/></message>
  <message name="CancelOut"><part name="parameters" element="tns:CancelOrderResult"/></message>

  <portType name="OrderServicePortType">
    <operation name="PlaceOrder">
      <input message="tns:PlaceIn"/>
      <output message="tns:PlaceOut"/>
    </operation>
    <operation name="GetOrderStatus">
      <input message="tns:StatusIn"/>
      <output message="tns:StatusOut"/>
    </operation>
    <operation name="CancelOrder">
      <input message="tns:CancelIn"/>
      <output message="tns:CancelOut"/>
    </operation>
  </portType>

  <binding name="OrderServiceBinding" type="tns:OrderServicePortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="PlaceOrder">
      <soap:operation soapAction="http://ecommerce.example.com/order/PlaceOrder"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="GetOrderStatus">
      <soap:operation soapAction="http://ecommerce.example.com/order/GetOrderStatus"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="CancelOrder">
      <soap:operation soapAction="http://ecommerce.example.com/order/CancelOrder"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="ECommerceOrderService">
    <port name="OrderServicePort" binding="tns:OrderServiceBinding">
      <soap:address location="http://localhost:8080/services/ECommerceOrder"/>
    </port>
  </service>
</definitions>`,
  },
  {
    id: 'ecommerce-order-xsd',
    label: 'E-Commerce Order (XSD)',
    filename: 'ECommerceOrder.xsd',
    description: 'Order line items, shipping address, payment types',
    type: 'xsd',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:tns="http://ecommerce.example.com/order/types"
  targetNamespace="http://ecommerce.example.com/order/types"
  elementFormDefault="qualified">

  <xsd:complexType name="OrderLineItem">
    <xsd:sequence>
      <xsd:element name="sku" type="xsd:string"/>
      <xsd:element name="productName" type="xsd:string"/>
      <xsd:element name="quantity" type="xsd:int"/>
      <xsd:element name="unitPrice" type="xsd:decimal"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="ShippingAddress">
    <xsd:sequence>
      <xsd:element name="name" type="xsd:string"/>
      <xsd:element name="street" type="xsd:string"/>
      <xsd:element name="city" type="xsd:string"/>
      <xsd:element name="state" type="xsd:string"/>
      <xsd:element name="zipCode" type="xsd:string"/>
      <xsd:element name="country" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="PlaceOrderRequest">
    <xsd:sequence>
      <xsd:element name="customerId" type="xsd:string"/>
      <xsd:element name="items" type="tns:OrderLineItem" maxOccurs="unbounded"/>
      <xsd:element name="shippingAddress" type="tns:ShippingAddress"/>
      <xsd:element name="paymentMethod" type="xsd:string"/>
      <xsd:element name="couponCode" type="xsd:string" minOccurs="0"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="OrderConfirmation">
    <xsd:sequence>
      <xsd:element name="orderId" type="xsd:string"/>
      <xsd:element name="total" type="xsd:decimal"/>
      <xsd:element name="tax" type="xsd:decimal"/>
      <xsd:element name="shipping" type="xsd:decimal"/>
      <xsd:element name="estimatedDelivery" type="xsd:date"/>
      <xsd:element name="status" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="GetOrderStatusRequest">
    <xsd:sequence>
      <xsd:element name="orderId" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="OrderStatus">
    <xsd:sequence>
      <xsd:element name="orderId" type="xsd:string"/>
      <xsd:element name="status" type="xsd:string"/>
      <xsd:element name="trackingNumber" type="xsd:string" minOccurs="0"/>
      <xsd:element name="lastUpdated" type="xsd:dateTime"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="CancelOrderRequest">
    <xsd:sequence>
      <xsd:element name="orderId" type="xsd:string"/>
      <xsd:element name="reason" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="CancelConfirmation">
    <xsd:sequence>
      <xsd:element name="orderId" type="xsd:string"/>
      <xsd:element name="refundAmount" type="xsd:decimal"/>
      <xsd:element name="status" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>
</xsd:schema>`,
  },
  {
    id: 'banking-account-wsdl',
    label: 'Banking Account (WSDL)',
    filename: 'BankingAccount.wsdl',
    description: 'Balance inquiry, transfer, and transaction history',
    type: 'wsdl',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://banking.example.com/account"
  xmlns:acc="http://banking.example.com/account/types"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://banking.example.com/account"
  name="BankingAccountService">

  <types>
    <xsd:schema targetNamespace="http://banking.example.com/account">
      <xsd:import namespace="http://banking.example.com/account/types"
        schemaLocation="BankingAccount.xsd"/>
      <xsd:element name="GetBalance" type="acc:GetBalanceRequest"/>
      <xsd:element name="GetBalanceResult" type="acc:BalanceResponse"/>
      <xsd:element name="Transfer" type="acc:TransferRequest"/>
      <xsd:element name="TransferResult" type="acc:TransferResponse"/>
      <xsd:element name="GetTransactions" type="acc:GetTransactionsRequest"/>
      <xsd:element name="GetTransactionsResult" type="acc:TransactionListResponse"/>
    </xsd:schema>
  </types>

  <message name="BalIn"><part name="parameters" element="tns:GetBalance"/></message>
  <message name="BalOut"><part name="parameters" element="tns:GetBalanceResult"/></message>
  <message name="TxIn"><part name="parameters" element="tns:Transfer"/></message>
  <message name="TxOut"><part name="parameters" element="tns:TransferResult"/></message>
  <message name="HistIn"><part name="parameters" element="tns:GetTransactions"/></message>
  <message name="HistOut"><part name="parameters" element="tns:GetTransactionsResult"/></message>

  <portType name="BankingAccountPortType">
    <operation name="GetBalance">
      <input message="tns:BalIn"/>
      <output message="tns:BalOut"/>
    </operation>
    <operation name="Transfer">
      <input message="tns:TxIn"/>
      <output message="tns:TxOut"/>
    </operation>
    <operation name="GetTransactions">
      <input message="tns:HistIn"/>
      <output message="tns:HistOut"/>
    </operation>
  </portType>

  <binding name="BankingAccountBinding" type="tns:BankingAccountPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="GetBalance">
      <soap:operation soapAction="http://banking.example.com/account/GetBalance"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="Transfer">
      <soap:operation soapAction="http://banking.example.com/account/Transfer"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="GetTransactions">
      <soap:operation soapAction="http://banking.example.com/account/GetTransactions"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="BankingAccountService">
    <port name="BankingAccountPort" binding="tns:BankingAccountBinding">
      <soap:address location="http://localhost:8080/services/BankingAccount"/>
    </port>
  </service>
</definitions>`,
  },
  {
    id: 'banking-account-xsd',
    label: 'Banking Account (XSD)',
    filename: 'BankingAccount.xsd',
    description: 'Account balance, transfer, and transaction record types',
    type: 'xsd',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:tns="http://banking.example.com/account/types"
  targetNamespace="http://banking.example.com/account/types"
  elementFormDefault="qualified">

  <xsd:complexType name="GetBalanceRequest">
    <xsd:sequence>
      <xsd:element name="accountNumber" type="xsd:string"/>
      <xsd:element name="pin" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="BalanceResponse">
    <xsd:sequence>
      <xsd:element name="accountNumber" type="xsd:string"/>
      <xsd:element name="availableBalance" type="xsd:decimal"/>
      <xsd:element name="currentBalance" type="xsd:decimal"/>
      <xsd:element name="currency" type="xsd:string"/>
      <xsd:element name="lastTransactionDate" type="xsd:dateTime"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="TransferRequest">
    <xsd:sequence>
      <xsd:element name="fromAccount" type="xsd:string"/>
      <xsd:element name="toAccount" type="xsd:string"/>
      <xsd:element name="amount" type="xsd:decimal"/>
      <xsd:element name="currency" type="xsd:string"/>
      <xsd:element name="description" type="xsd:string" minOccurs="0"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="TransferResponse">
    <xsd:sequence>
      <xsd:element name="transactionId" type="xsd:string"/>
      <xsd:element name="status" type="xsd:string"/>
      <xsd:element name="newBalance" type="xsd:decimal"/>
      <xsd:element name="timestamp" type="xsd:dateTime"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="GetTransactionsRequest">
    <xsd:sequence>
      <xsd:element name="accountNumber" type="xsd:string"/>
      <xsd:element name="fromDate" type="xsd:date"/>
      <xsd:element name="toDate" type="xsd:date"/>
      <xsd:element name="maxResults" type="xsd:int" minOccurs="0"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="TransactionRecord">
    <xsd:sequence>
      <xsd:element name="transactionId" type="xsd:string"/>
      <xsd:element name="date" type="xsd:dateTime"/>
      <xsd:element name="type" type="xsd:string"/>
      <xsd:element name="amount" type="xsd:decimal"/>
      <xsd:element name="description" type="xsd:string"/>
      <xsd:element name="balance" type="xsd:decimal"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="TransactionListResponse">
    <xsd:sequence>
      <xsd:element name="accountNumber" type="xsd:string"/>
      <xsd:element name="totalCount" type="xsd:int"/>
      <xsd:element name="transactions" type="tns:TransactionRecord" minOccurs="0" maxOccurs="unbounded"/>
    </xsd:sequence>
  </xsd:complexType>
</xsd:schema>`,
  },
  {
    id: 'hr-employee-wsdl',
    label: 'HR Employee (WSDL)',
    filename: 'HrEmployee.wsdl',
    description: 'Employee directory, leave management, payroll lookup',
    type: 'wsdl',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://hr.example.com/employee"
  xmlns:emp="http://hr.example.com/employee/types"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://hr.example.com/employee"
  name="HrEmployeeService">

  <types>
    <xsd:schema targetNamespace="http://hr.example.com/employee">
      <xsd:import namespace="http://hr.example.com/employee/types"
        schemaLocation="HrEmployee.xsd"/>
      <xsd:element name="GetEmployee" type="emp:GetEmployeeRequest"/>
      <xsd:element name="GetEmployeeResult" type="emp:EmployeeRecord"/>
      <xsd:element name="RequestLeave" type="emp:LeaveRequest"/>
      <xsd:element name="RequestLeaveResult" type="emp:LeaveResponse"/>
      <xsd:element name="GetPayslip" type="emp:PayslipRequest"/>
      <xsd:element name="GetPayslipResult" type="emp:PayslipResponse"/>
    </xsd:schema>
  </types>

  <message name="EmpIn"><part name="parameters" element="tns:GetEmployee"/></message>
  <message name="EmpOut"><part name="parameters" element="tns:GetEmployeeResult"/></message>
  <message name="LeaveIn"><part name="parameters" element="tns:RequestLeave"/></message>
  <message name="LeaveOut"><part name="parameters" element="tns:RequestLeaveResult"/></message>
  <message name="PayIn"><part name="parameters" element="tns:GetPayslip"/></message>
  <message name="PayOut"><part name="parameters" element="tns:GetPayslipResult"/></message>

  <portType name="HrEmployeePortType">
    <operation name="GetEmployee">
      <input message="tns:EmpIn"/>
      <output message="tns:EmpOut"/>
    </operation>
    <operation name="RequestLeave">
      <input message="tns:LeaveIn"/>
      <output message="tns:LeaveOut"/>
    </operation>
    <operation name="GetPayslip">
      <input message="tns:PayIn"/>
      <output message="tns:PayOut"/>
    </operation>
  </portType>

  <binding name="HrEmployeeBinding" type="tns:HrEmployeePortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="GetEmployee">
      <soap:operation soapAction="http://hr.example.com/employee/GetEmployee"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="RequestLeave">
      <soap:operation soapAction="http://hr.example.com/employee/RequestLeave"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="GetPayslip">
      <soap:operation soapAction="http://hr.example.com/employee/GetPayslip"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="HrEmployeeService">
    <port name="HrEmployeePort" binding="tns:HrEmployeeBinding">
      <soap:address location="http://localhost:8080/services/HrEmployee"/>
    </port>
  </service>
</definitions>`,
  },
  {
    id: 'hr-employee-xsd',
    label: 'HR Employee (XSD)',
    filename: 'HrEmployee.xsd',
    description: 'Employee record, leave, and payslip complex types',
    type: 'xsd',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:tns="http://hr.example.com/employee/types"
  targetNamespace="http://hr.example.com/employee/types"
  elementFormDefault="qualified">

  <xsd:complexType name="GetEmployeeRequest">
    <xsd:sequence>
      <xsd:element name="employeeId" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="EmployeeRecord">
    <xsd:sequence>
      <xsd:element name="employeeId" type="xsd:string"/>
      <xsd:element name="firstName" type="xsd:string"/>
      <xsd:element name="lastName" type="xsd:string"/>
      <xsd:element name="email" type="xsd:string"/>
      <xsd:element name="department" type="xsd:string"/>
      <xsd:element name="title" type="xsd:string"/>
      <xsd:element name="manager" type="xsd:string"/>
      <xsd:element name="hireDate" type="xsd:date"/>
      <xsd:element name="location" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="LeaveRequest">
    <xsd:sequence>
      <xsd:element name="employeeId" type="xsd:string"/>
      <xsd:element name="leaveType" type="xsd:string"/>
      <xsd:element name="startDate" type="xsd:date"/>
      <xsd:element name="endDate" type="xsd:date"/>
      <xsd:element name="reason" type="xsd:string" minOccurs="0"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="LeaveResponse">
    <xsd:sequence>
      <xsd:element name="requestId" type="xsd:string"/>
      <xsd:element name="status" type="xsd:string"/>
      <xsd:element name="remainingBalance" type="xsd:int"/>
      <xsd:element name="approver" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="PayslipRequest">
    <xsd:sequence>
      <xsd:element name="employeeId" type="xsd:string"/>
      <xsd:element name="month" type="xsd:int"/>
      <xsd:element name="year" type="xsd:int"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="PayslipResponse">
    <xsd:sequence>
      <xsd:element name="employeeId" type="xsd:string"/>
      <xsd:element name="period" type="xsd:string"/>
      <xsd:element name="grossPay" type="xsd:decimal"/>
      <xsd:element name="deductions" type="xsd:decimal"/>
      <xsd:element name="netPay" type="xsd:decimal"/>
      <xsd:element name="payDate" type="xsd:date"/>
    </xsd:sequence>
  </xsd:complexType>
</xsd:schema>`,
  },
  {
    id: 'insurance-claims-wsdl',
    label: 'Insurance Claims (WSDL)',
    filename: 'InsuranceClaims.wsdl',
    description: 'Claim submission, status check, and adjudication',
    type: 'wsdl',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://insurance.example.com/claims"
  xmlns:clm="http://insurance.example.com/claims/types"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://insurance.example.com/claims"
  name="InsuranceClaimsService">

  <types>
    <xsd:schema targetNamespace="http://insurance.example.com/claims">
      <xsd:import namespace="http://insurance.example.com/claims/types"
        schemaLocation="InsuranceClaims.xsd"/>
      <xsd:element name="SubmitClaim" type="clm:SubmitClaimRequest"/>
      <xsd:element name="SubmitClaimResult" type="clm:ClaimConfirmation"/>
      <xsd:element name="GetClaimStatus" type="clm:GetClaimStatusRequest"/>
      <xsd:element name="GetClaimStatusResult" type="clm:ClaimStatusResponse"/>
      <xsd:element name="AppealClaim" type="clm:AppealRequest"/>
      <xsd:element name="AppealClaimResult" type="clm:AppealResponse"/>
    </xsd:schema>
  </types>

  <message name="SubmitIn"><part name="parameters" element="tns:SubmitClaim"/></message>
  <message name="SubmitOut"><part name="parameters" element="tns:SubmitClaimResult"/></message>
  <message name="StatusIn"><part name="parameters" element="tns:GetClaimStatus"/></message>
  <message name="StatusOut"><part name="parameters" element="tns:GetClaimStatusResult"/></message>
  <message name="AppealIn"><part name="parameters" element="tns:AppealClaim"/></message>
  <message name="AppealOut"><part name="parameters" element="tns:AppealClaimResult"/></message>

  <portType name="ClaimsServicePortType">
    <operation name="SubmitClaim">
      <input message="tns:SubmitIn"/>
      <output message="tns:SubmitOut"/>
    </operation>
    <operation name="GetClaimStatus">
      <input message="tns:StatusIn"/>
      <output message="tns:StatusOut"/>
    </operation>
    <operation name="AppealClaim">
      <input message="tns:AppealIn"/>
      <output message="tns:AppealOut"/>
    </operation>
  </portType>

  <binding name="ClaimsServiceBinding" type="tns:ClaimsServicePortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="SubmitClaim">
      <soap:operation soapAction="http://insurance.example.com/claims/SubmitClaim"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="GetClaimStatus">
      <soap:operation soapAction="http://insurance.example.com/claims/GetClaimStatus"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="AppealClaim">
      <soap:operation soapAction="http://insurance.example.com/claims/AppealClaim"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="InsuranceClaimsService">
    <port name="ClaimsServicePort" binding="tns:ClaimsServiceBinding">
      <soap:address location="http://localhost:8080/services/InsuranceClaims"/>
    </port>
  </service>
</definitions>`,
  },
  {
    id: 'insurance-claims-xsd',
    label: 'Insurance Claims (XSD)',
    filename: 'InsuranceClaims.xsd',
    description: 'Claim details, adjudication, and appeal types',
    type: 'xsd',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:tns="http://insurance.example.com/claims/types"
  targetNamespace="http://insurance.example.com/claims/types"
  elementFormDefault="qualified">

  <xsd:complexType name="SubmitClaimRequest">
    <xsd:sequence>
      <xsd:element name="policyNumber" type="xsd:string"/>
      <xsd:element name="claimType" type="xsd:string"/>
      <xsd:element name="dateOfLoss" type="xsd:date"/>
      <xsd:element name="description" type="xsd:string"/>
      <xsd:element name="amount" type="xsd:decimal"/>
      <xsd:element name="documents" type="xsd:string" minOccurs="0" maxOccurs="unbounded"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="ClaimConfirmation">
    <xsd:sequence>
      <xsd:element name="claimId" type="xsd:string"/>
      <xsd:element name="referenceNumber" type="xsd:string"/>
      <xsd:element name="status" type="xsd:string"/>
      <xsd:element name="submittedDate" type="xsd:dateTime"/>
      <xsd:element name="estimatedProcessingDays" type="xsd:int"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="GetClaimStatusRequest">
    <xsd:sequence>
      <xsd:element name="claimId" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="ClaimStatusResponse">
    <xsd:sequence>
      <xsd:element name="claimId" type="xsd:string"/>
      <xsd:element name="status" type="xsd:string"/>
      <xsd:element name="adjudicatedAmount" type="xsd:decimal" minOccurs="0"/>
      <xsd:element name="approvedAmount" type="xsd:decimal" minOccurs="0"/>
      <xsd:element name="denialReason" type="xsd:string" minOccurs="0"/>
      <xsd:element name="lastUpdated" type="xsd:dateTime"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="AppealRequest">
    <xsd:sequence>
      <xsd:element name="claimId" type="xsd:string"/>
      <xsd:element name="reason" type="xsd:string"/>
      <xsd:element name="additionalDocuments" type="xsd:string" minOccurs="0" maxOccurs="unbounded"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="AppealResponse">
    <xsd:sequence>
      <xsd:element name="appealId" type="xsd:string"/>
      <xsd:element name="status" type="xsd:string"/>
      <xsd:element name="reviewDate" type="xsd:date"/>
    </xsd:sequence>
  </xsd:complexType>
</xsd:schema>`,
  },
  {
    id: 'flight-booking-wsdl',
    label: 'Flight Booking (WSDL)',
    filename: 'FlightBooking.wsdl',
    description: 'Flight search, booking, and check-in with XSD types',
    type: 'wsdl',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://airline.example.com/booking"
  xmlns:flt="http://airline.example.com/booking/types"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://airline.example.com/booking"
  name="FlightBookingService">

  <types>
    <xsd:schema targetNamespace="http://airline.example.com/booking">
      <xsd:import namespace="http://airline.example.com/booking/types"
        schemaLocation="FlightBooking.xsd"/>
      <xsd:element name="SearchFlights" type="flt:SearchFlightsRequest"/>
      <xsd:element name="SearchFlightsResult" type="flt:FlightSearchResponse"/>
      <xsd:element name="BookFlight" type="flt:BookFlightRequest"/>
      <xsd:element name="BookFlightResult" type="flt:BookingConfirmation"/>
      <xsd:element name="CheckIn" type="flt:CheckInRequest"/>
      <xsd:element name="CheckInResult" type="flt:BoardingPass"/>
    </xsd:schema>
  </types>

  <message name="SearchIn"><part name="parameters" element="tns:SearchFlights"/></message>
  <message name="SearchOut"><part name="parameters" element="tns:SearchFlightsResult"/></message>
  <message name="BookIn"><part name="parameters" element="tns:BookFlight"/></message>
  <message name="BookOut"><part name="parameters" element="tns:BookFlightResult"/></message>
  <message name="CheckInIn"><part name="parameters" element="tns:CheckIn"/></message>
  <message name="CheckInOut"><part name="parameters" element="tns:CheckInResult"/></message>

  <portType name="FlightBookingPortType">
    <operation name="SearchFlights">
      <input message="tns:SearchIn"/>
      <output message="tns:SearchOut"/>
    </operation>
    <operation name="BookFlight">
      <input message="tns:BookIn"/>
      <output message="tns:BookOut"/>
    </operation>
    <operation name="CheckIn">
      <input message="tns:CheckInIn"/>
      <output message="tns:CheckInOut"/>
    </operation>
  </portType>

  <binding name="FlightBookingBinding" type="tns:FlightBookingPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="SearchFlights">
      <soap:operation soapAction="http://airline.example.com/booking/SearchFlights"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="BookFlight">
      <soap:operation soapAction="http://airline.example.com/booking/BookFlight"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="CheckIn">
      <soap:operation soapAction="http://airline.example.com/booking/CheckIn"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="FlightBookingService">
    <port name="FlightBookingPort" binding="tns:FlightBookingBinding">
      <soap:address location="http://localhost:8080/services/FlightBooking"/>
    </port>
  </service>
</definitions>`,
  },
  {
    id: 'flight-booking-xsd',
    label: 'Flight Booking (XSD)',
    filename: 'FlightBooking.xsd',
    description: 'Passenger, flight itinerary, and boarding pass types',
    type: 'xsd',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:tns="http://airline.example.com/booking/types"
  targetNamespace="http://airline.example.com/booking/types"
  elementFormDefault="qualified">

  <xsd:complexType name="SearchFlightsRequest">
    <xsd:sequence>
      <xsd:element name="origin" type="xsd:string"/>
      <xsd:element name="destination" type="xsd:string"/>
      <xsd:element name="departureDate" type="xsd:date"/>
      <xsd:element name="returnDate" type="xsd:date" minOccurs="0"/>
      <xsd:element name="passengers" type="xsd:int"/>
      <xsd:element name="cabinClass" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="FlightOption">
    <xsd:sequence>
      <xsd:element name="flightNumber" type="xsd:string"/>
      <xsd:element name="airline" type="xsd:string"/>
      <xsd:element name="departure" type="xsd:dateTime"/>
      <xsd:element name="arrival" type="xsd:dateTime"/>
      <xsd:element name="price" type="xsd:decimal"/>
      <xsd:element name="seatsAvailable" type="xsd:int"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="FlightSearchResponse">
    <xsd:sequence>
      <xsd:element name="flights" type="tns:FlightOption" minOccurs="0" maxOccurs="unbounded"/>
      <xsd:element name="totalResults" type="xsd:int"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="Passenger">
    <xsd:sequence>
      <xsd:element name="firstName" type="xsd:string"/>
      <xsd:element name="lastName" type="xsd:string"/>
      <xsd:element name="passportNumber" type="xsd:string"/>
      <xsd:element name="dateOfBirth" type="xsd:date"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="BookFlightRequest">
    <xsd:sequence>
      <xsd:element name="flightNumber" type="xsd:string"/>
      <xsd:element name="passengers" type="tns:Passenger" maxOccurs="unbounded"/>
      <xsd:element name="paymentMethod" type="xsd:string"/>
      <xsd:element name="seatPreference" type="xsd:string" minOccurs="0"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="BookingConfirmation">
    <xsd:sequence>
      <xsd:element name="bookingReference" type="xsd:string"/>
      <xsd:element name="status" type="xsd:string"/>
      <xsd:element name="totalPrice" type="xsd:decimal"/>
      <xsd:element name="currency" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="CheckInRequest">
    <xsd:sequence>
      <xsd:element name="bookingReference" type="xsd:string"/>
      <xsd:element name="passengerName" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>

  <xsd:complexType name="BoardingPass">
    <xsd:sequence>
      <xsd:element name="passengerName" type="xsd:string"/>
      <xsd:element name="flightNumber" type="xsd:string"/>
      <xsd:element name="gate" type="xsd:string"/>
      <xsd:element name="seat" type="xsd:string"/>
      <xsd:element name="boardingTime" type="xsd:dateTime"/>
      <xsd:element name="barcode" type="xsd:string"/>
    </xsd:sequence>
  </xsd:complexType>
</xsd:schema>`,
  },
];
