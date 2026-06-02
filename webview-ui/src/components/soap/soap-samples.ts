/**
 * Sample WSDL and SOAP envelope definitions for download and quick-start.
 * Users can download these to test SOAP client functionality with the mock server.
 */

export interface SoapSample {
  id: string;
  label: string;
  description: string;
  wsdlFilename: string;
  wsdlContent: string;
  operations: SoapSampleOperation[];
}

export interface SoapSampleOperation {
  name: string;
  soapAction: string;
  requestEnvelope: string;
  responseEnvelope: string;
}

export const SOAP_SAMPLES: SoapSample[] = [
  {
    id: 'calculator',
    label: 'Calculator Service',
    description: 'Basic arithmetic operations: Add, Subtract, Multiply, Divide',
    wsdlFilename: 'calculator.wsdl',
    wsdlContent: `<?xml version="1.0" encoding="UTF-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://calculator.daakia.dev/"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://calculator.daakia.dev/"
  name="CalculatorService">

  <wsdl:types>
    <xsd:schema targetNamespace="http://calculator.daakia.dev/">
      <xsd:element name="Add">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="a" type="xsd:double"/>
            <xsd:element name="b" type="xsd:double"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="AddResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="result" type="xsd:double"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="Subtract">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="a" type="xsd:double"/>
            <xsd:element name="b" type="xsd:double"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="SubtractResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="result" type="xsd:double"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="Multiply">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="a" type="xsd:double"/>
            <xsd:element name="b" type="xsd:double"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="MultiplyResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="result" type="xsd:double"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="Divide">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="a" type="xsd:double"/>
            <xsd:element name="b" type="xsd:double"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="DivideResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="result" type="xsd:double"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </wsdl:types>

  <wsdl:message name="AddRequest"><wsdl:part name="parameters" element="tns:Add"/></wsdl:message>
  <wsdl:message name="AddResponse"><wsdl:part name="parameters" element="tns:AddResponse"/></wsdl:message>
  <wsdl:message name="SubtractRequest"><wsdl:part name="parameters" element="tns:Subtract"/></wsdl:message>
  <wsdl:message name="SubtractResponse"><wsdl:part name="parameters" element="tns:SubtractResponse"/></wsdl:message>
  <wsdl:message name="MultiplyRequest"><wsdl:part name="parameters" element="tns:Multiply"/></wsdl:message>
  <wsdl:message name="MultiplyResponse"><wsdl:part name="parameters" element="tns:MultiplyResponse"/></wsdl:message>
  <wsdl:message name="DivideRequest"><wsdl:part name="parameters" element="tns:Divide"/></wsdl:message>
  <wsdl:message name="DivideResponse"><wsdl:part name="parameters" element="tns:DivideResponse"/></wsdl:message>

  <wsdl:portType name="CalculatorPortType">
    <wsdl:operation name="Add">
      <wsdl:input message="tns:AddRequest"/>
      <wsdl:output message="tns:AddResponse"/>
    </wsdl:operation>
    <wsdl:operation name="Subtract">
      <wsdl:input message="tns:SubtractRequest"/>
      <wsdl:output message="tns:SubtractResponse"/>
    </wsdl:operation>
    <wsdl:operation name="Multiply">
      <wsdl:input message="tns:MultiplyRequest"/>
      <wsdl:output message="tns:MultiplyResponse"/>
    </wsdl:operation>
    <wsdl:operation name="Divide">
      <wsdl:input message="tns:DivideRequest"/>
      <wsdl:output message="tns:DivideResponse"/>
    </wsdl:operation>
  </wsdl:portType>

  <wsdl:binding name="CalculatorBinding" type="tns:CalculatorPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="Add">
      <soap:operation soapAction="http://calculator.daakia.dev/Add"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="Subtract">
      <soap:operation soapAction="http://calculator.daakia.dev/Subtract"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="Multiply">
      <soap:operation soapAction="http://calculator.daakia.dev/Multiply"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="Divide">
      <soap:operation soapAction="http://calculator.daakia.dev/Divide"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>

  <wsdl:service name="CalculatorService">
    <wsdl:port name="CalculatorPort" binding="tns:CalculatorBinding">
      <soap:address location="http://localhost:8080/soap"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`,
    operations: [
      {
        name: 'Add',
        soapAction: 'http://calculator.daakia.dev/Add',
        requestEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:cal="http://calculator.daakia.dev/">
  <soap:Header/>
  <soap:Body>
    <cal:Add>
      <cal:a>15</cal:a>
      <cal:b>27</cal:b>
    </cal:Add>
  </soap:Body>
</soap:Envelope>`,
        responseEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:cal="http://calculator.daakia.dev/">
  <soap:Body>
    <cal:AddResponse>
      <cal:result>42</cal:result>
    </cal:AddResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        name: 'Subtract',
        soapAction: 'http://calculator.daakia.dev/Subtract',
        requestEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:cal="http://calculator.daakia.dev/">
  <soap:Header/>
  <soap:Body>
    <cal:Subtract>
      <cal:a>100</cal:a>
      <cal:b>58</cal:b>
    </cal:Subtract>
  </soap:Body>
</soap:Envelope>`,
        responseEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:cal="http://calculator.daakia.dev/">
  <soap:Body>
    <cal:SubtractResponse>
      <cal:result>42</cal:result>
    </cal:SubtractResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        name: 'Multiply',
        soapAction: 'http://calculator.daakia.dev/Multiply',
        requestEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:cal="http://calculator.daakia.dev/">
  <soap:Header/>
  <soap:Body>
    <cal:Multiply>
      <cal:a>6</cal:a>
      <cal:b>7</cal:b>
    </cal:Multiply>
  </soap:Body>
</soap:Envelope>`,
        responseEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:cal="http://calculator.daakia.dev/">
  <soap:Body>
    <cal:MultiplyResponse>
      <cal:result>42</cal:result>
    </cal:MultiplyResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        name: 'Divide',
        soapAction: 'http://calculator.daakia.dev/Divide',
        requestEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:cal="http://calculator.daakia.dev/">
  <soap:Header/>
  <soap:Body>
    <cal:Divide>
      <cal:a>84</cal:a>
      <cal:b>2</cal:b>
    </cal:Divide>
  </soap:Body>
</soap:Envelope>`,
        responseEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:cal="http://calculator.daakia.dev/">
  <soap:Body>
    <cal:DivideResponse>
      <cal:result>42</cal:result>
    </cal:DivideResponse>
  </soap:Body>
</soap:Envelope>`,
      },
    ],
  },
  {
    id: 'weather',
    label: 'Weather Service',
    description: 'Get current weather and forecast by city name or coordinates',
    wsdlFilename: 'weather.wsdl',
    wsdlContent: `<?xml version="1.0" encoding="UTF-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://weather.daakia.dev/"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://weather.daakia.dev/"
  name="WeatherService">

  <wsdl:types>
    <xsd:schema targetNamespace="http://weather.daakia.dev/">
      <xsd:element name="GetWeather">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="city" type="xsd:string"/>
            <xsd:element name="country" type="xsd:string" minOccurs="0"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="GetWeatherResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="temperature" type="xsd:double"/>
            <xsd:element name="unit" type="xsd:string"/>
            <xsd:element name="condition" type="xsd:string"/>
            <xsd:element name="humidity" type="xsd:int"/>
            <xsd:element name="windSpeed" type="xsd:double"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="GetForecast">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="city" type="xsd:string"/>
            <xsd:element name="days" type="xsd:int"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="GetForecastResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="forecast" maxOccurs="unbounded">
              <xsd:complexType>
                <xsd:sequence>
                  <xsd:element name="date" type="xsd:date"/>
                  <xsd:element name="high" type="xsd:double"/>
                  <xsd:element name="low" type="xsd:double"/>
                  <xsd:element name="condition" type="xsd:string"/>
                </xsd:sequence>
              </xsd:complexType>
            </xsd:element>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </wsdl:types>

  <wsdl:message name="GetWeatherRequest"><wsdl:part name="parameters" element="tns:GetWeather"/></wsdl:message>
  <wsdl:message name="GetWeatherResponse"><wsdl:part name="parameters" element="tns:GetWeatherResponse"/></wsdl:message>
  <wsdl:message name="GetForecastRequest"><wsdl:part name="parameters" element="tns:GetForecast"/></wsdl:message>
  <wsdl:message name="GetForecastResponse"><wsdl:part name="parameters" element="tns:GetForecastResponse"/></wsdl:message>

  <wsdl:portType name="WeatherPortType">
    <wsdl:operation name="GetWeather">
      <wsdl:input message="tns:GetWeatherRequest"/>
      <wsdl:output message="tns:GetWeatherResponse"/>
    </wsdl:operation>
    <wsdl:operation name="GetForecast">
      <wsdl:input message="tns:GetForecastRequest"/>
      <wsdl:output message="tns:GetForecastResponse"/>
    </wsdl:operation>
  </wsdl:portType>

  <wsdl:binding name="WeatherBinding" type="tns:WeatherPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="GetWeather">
      <soap:operation soapAction="http://weather.daakia.dev/GetWeather"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="GetForecast">
      <soap:operation soapAction="http://weather.daakia.dev/GetForecast"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>

  <wsdl:service name="WeatherService">
    <wsdl:port name="WeatherPort" binding="tns:WeatherBinding">
      <soap:address location="http://localhost:8080/soap"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`,
    operations: [
      {
        name: 'GetWeather',
        soapAction: 'http://weather.daakia.dev/GetWeather',
        requestEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:wea="http://weather.daakia.dev/">
  <soap:Header/>
  <soap:Body>
    <wea:GetWeather>
      <wea:city>San Francisco</wea:city>
      <wea:country>US</wea:country>
    </wea:GetWeather>
  </soap:Body>
</soap:Envelope>`,
        responseEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:wea="http://weather.daakia.dev/">
  <soap:Body>
    <wea:GetWeatherResponse>
      <wea:temperature>68.5</wea:temperature>
      <wea:unit>Fahrenheit</wea:unit>
      <wea:condition>Partly Cloudy</wea:condition>
      <wea:humidity>65</wea:humidity>
      <wea:windSpeed>12.3</wea:windSpeed>
    </wea:GetWeatherResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        name: 'GetForecast',
        soapAction: 'http://weather.daakia.dev/GetForecast',
        requestEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:wea="http://weather.daakia.dev/">
  <soap:Header/>
  <soap:Body>
    <wea:GetForecast>
      <wea:city>New York</wea:city>
      <wea:days>3</wea:days>
    </wea:GetForecast>
  </soap:Body>
</soap:Envelope>`,
        responseEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:wea="http://weather.daakia.dev/">
  <soap:Body>
    <wea:GetForecastResponse>
      <wea:forecast>
        <wea:date>2026-06-01</wea:date>
        <wea:high>78.0</wea:high>
        <wea:low>62.0</wea:low>
        <wea:condition>Sunny</wea:condition>
      </wea:forecast>
      <wea:forecast>
        <wea:date>2026-06-02</wea:date>
        <wea:high>75.0</wea:high>
        <wea:low>60.0</wea:low>
        <wea:condition>Cloudy</wea:condition>
      </wea:forecast>
      <wea:forecast>
        <wea:date>2026-06-03</wea:date>
        <wea:high>72.0</wea:high>
        <wea:low>58.0</wea:low>
        <wea:condition>Rain</wea:condition>
      </wea:forecast>
    </wea:GetForecastResponse>
  </soap:Body>
</soap:Envelope>`,
      },
    ],
  },
  {
    id: 'user-management',
    label: 'User Management Service',
    description: 'CRUD operations for users with authentication tokens',
    wsdlFilename: 'user-management.wsdl',
    wsdlContent: `<?xml version="1.0" encoding="UTF-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://usermgmt.daakia.dev/"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://usermgmt.daakia.dev/"
  name="UserManagementService">

  <wsdl:types>
    <xsd:schema targetNamespace="http://usermgmt.daakia.dev/">
      <xsd:element name="GetUser">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="userId" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="GetUserResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="id" type="xsd:string"/>
            <xsd:element name="name" type="xsd:string"/>
            <xsd:element name="email" type="xsd:string"/>
            <xsd:element name="role" type="xsd:string"/>
            <xsd:element name="createdAt" type="xsd:dateTime"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="CreateUser">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="name" type="xsd:string"/>
            <xsd:element name="email" type="xsd:string"/>
            <xsd:element name="password" type="xsd:string"/>
            <xsd:element name="role" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="CreateUserResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="id" type="xsd:string"/>
            <xsd:element name="success" type="xsd:boolean"/>
            <xsd:element name="message" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="Authenticate">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="email" type="xsd:string"/>
            <xsd:element name="password" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="AuthenticateResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="token" type="xsd:string"/>
            <xsd:element name="expiresIn" type="xsd:int"/>
            <xsd:element name="userId" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </wsdl:types>

  <wsdl:message name="GetUserRequest"><wsdl:part name="parameters" element="tns:GetUser"/></wsdl:message>
  <wsdl:message name="GetUserResponse"><wsdl:part name="parameters" element="tns:GetUserResponse"/></wsdl:message>
  <wsdl:message name="CreateUserRequest"><wsdl:part name="parameters" element="tns:CreateUser"/></wsdl:message>
  <wsdl:message name="CreateUserResponse"><wsdl:part name="parameters" element="tns:CreateUserResponse"/></wsdl:message>
  <wsdl:message name="AuthenticateRequest"><wsdl:part name="parameters" element="tns:Authenticate"/></wsdl:message>
  <wsdl:message name="AuthenticateResponse"><wsdl:part name="parameters" element="tns:AuthenticateResponse"/></wsdl:message>

  <wsdl:portType name="UserManagementPortType">
    <wsdl:operation name="GetUser">
      <wsdl:input message="tns:GetUserRequest"/>
      <wsdl:output message="tns:GetUserResponse"/>
    </wsdl:operation>
    <wsdl:operation name="CreateUser">
      <wsdl:input message="tns:CreateUserRequest"/>
      <wsdl:output message="tns:CreateUserResponse"/>
    </wsdl:operation>
    <wsdl:operation name="Authenticate">
      <wsdl:input message="tns:AuthenticateRequest"/>
      <wsdl:output message="tns:AuthenticateResponse"/>
    </wsdl:operation>
  </wsdl:portType>

  <wsdl:binding name="UserManagementBinding" type="tns:UserManagementPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="GetUser">
      <soap:operation soapAction="http://usermgmt.daakia.dev/GetUser"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="CreateUser">
      <soap:operation soapAction="http://usermgmt.daakia.dev/CreateUser"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="Authenticate">
      <soap:operation soapAction="http://usermgmt.daakia.dev/Authenticate"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>

  <wsdl:service name="UserManagementService">
    <wsdl:port name="UserManagementPort" binding="tns:UserManagementBinding">
      <soap:address location="http://localhost:8080/soap"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`,
    operations: [
      {
        name: 'GetUser',
        soapAction: 'http://usermgmt.daakia.dev/GetUser',
        requestEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:usr="http://usermgmt.daakia.dev/">
  <soap:Header/>
  <soap:Body>
    <usr:GetUser>
      <usr:userId>usr-001</usr:userId>
    </usr:GetUser>
  </soap:Body>
</soap:Envelope>`,
        responseEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:usr="http://usermgmt.daakia.dev/">
  <soap:Body>
    <usr:GetUserResponse>
      <usr:id>usr-001</usr:id>
      <usr:name>John Doe</usr:name>
      <usr:email>john.doe@example.com</usr:email>
      <usr:role>admin</usr:role>
      <usr:createdAt>2025-01-15T10:30:00Z</usr:createdAt>
    </usr:GetUserResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        name: 'CreateUser',
        soapAction: 'http://usermgmt.daakia.dev/CreateUser',
        requestEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:usr="http://usermgmt.daakia.dev/">
  <soap:Header/>
  <soap:Body>
    <usr:CreateUser>
      <usr:name>Jane Smith</usr:name>
      <usr:email>jane.smith@example.com</usr:email>
      <usr:password>securePass123</usr:password>
      <usr:role>editor</usr:role>
    </usr:CreateUser>
  </soap:Body>
</soap:Envelope>`,
        responseEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:usr="http://usermgmt.daakia.dev/">
  <soap:Body>
    <usr:CreateUserResponse>
      <usr:id>usr-002</usr:id>
      <usr:success>true</usr:success>
      <usr:message>User created successfully</usr:message>
    </usr:CreateUserResponse>
  </soap:Body>
</soap:Envelope>`,
      },
      {
        name: 'Authenticate',
        soapAction: 'http://usermgmt.daakia.dev/Authenticate',
        requestEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:usr="http://usermgmt.daakia.dev/">
  <soap:Header/>
  <soap:Body>
    <usr:Authenticate>
      <usr:email>john.doe@example.com</usr:email>
      <usr:password>securePass123</usr:password>
    </usr:Authenticate>
  </soap:Body>
</soap:Envelope>`,
        responseEnvelope: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:usr="http://usermgmt.daakia.dev/">
  <soap:Body>
    <usr:AuthenticateResponse>
      <usr:token>eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-token-payload.signature</usr:token>
      <usr:expiresIn>3600</usr:expiresIn>
      <usr:userId>usr-001</usr:userId>
    </usr:AuthenticateResponse>
  </soap:Body>
</soap:Envelope>`,
      },
    ],
  },
];

/**
 * Get mock server operations from a SOAP sample (for quick-start mock server setup).
 */
export function getSampleMockOperations(sampleId: string) {
  const sample = SOAP_SAMPLES.find(s => s.id === sampleId);
  if (!sample) return [];
  return sample.operations.map(op => ({
    id: crypto.randomUUID(),
    service: sample.label.replace(/\s+Service$/, ''),
    operation: op.name,
    soapAction: op.soapAction,
    responseType: 'static' as const,
    response: op.responseEnvelope,
    delay: 0,
    enabled: true,
  }));
}
